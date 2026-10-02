import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { articleDates,firstUploadDate,manuscriptParagraph } from '../scripts/article-meta.mjs';

test('writing date defaults to upload; metadata can override or reset legacy dates',()=>{
  assert.deepEqual(articleDates({}, {}, '2026-10-02'), {writtenAt:'2026-10-02',uploadedAt:'2026-10-02'});
  assert.equal(articleDates({date:'2020-01-01'}, {}, '2026-10-02').writtenAt,'2020-01-01');
  assert.deepEqual(articleDates({date:'2020-01-01'}, {writtenAt:'2019-03-14'}, '2026-10-02'),{writtenAt:'2019-03-14',uploadedAt:'2026-10-02'});
  assert.equal(articleDates({date:'2020-01-01'}, {writtenAt:null}, '2026-10-02').writtenAt,'2026-10-02');
  assert.throws(()=>articleDates({}, {writtenAt:'2025-02-29'}, '2026-10-02'));
  assert.throws(()=>articleDates({}, {writtenAt:'yesterday'}, '2026-10-02'));
});

test('upload date survives body edits and renames, uses Shanghai calendar day',()=>{
  const cwd=mkdtempSync(path.join(tmpdir(),'fen-dates-'));
  const git=(args, date)=>execFileSync('git',args,{cwd,stdio:'pipe',env:{...process.env,GIT_AUTHOR_NAME:'Fixture',GIT_AUTHOR_EMAIL:'fixture@example.invalid',GIT_COMMITTER_NAME:'Fixture',GIT_COMMITTER_EMAIL:'fixture@example.invalid',...(date?{GIT_AUTHOR_DATE:date,GIT_COMMITTER_DATE:date}:{})}});
  try{
    git(['init']);writeFileSync(path.join(cwd,'story.txt'),'First version');git(['add','.']);git(['commit','-m','Upload'],'2024-01-01T20:00:00Z');
    writeFileSync(path.join(cwd,'story.txt'),'Updated version');git(['add','.']);git(['commit','-m','Edit'],'2025-06-01T00:00:00Z');
    assert.equal(firstUploadDate('story.txt',cwd),'2024-01-02');
    git(['mv','story.txt','renamed.txt']);git(['commit','-m','Rename'],'2026-01-01T00:00:00Z');
    assert.equal(firstUploadDate('renamed.txt',cwd),'2024-01-02');
  }finally{rmSync(cwd,{recursive:true,force:true});}
});

test('only existing centered section numerals become headings',()=>{
  const p=(value,alignment='left')=>({type:'paragraph',alignment,children:[{type:'run',children:[{type:'text',value}]}]});
  assert.equal(manuscriptParagraph(p('（九）','center')).styleId,'Heading2');
  assert.equal(manuscriptParagraph(p('一','center')).styleId,'Heading2');
  assert.equal(manuscriptParagraph(p('普通正文','center')).styleId,undefined);
  assert.equal(manuscriptParagraph(p('（一）')).styleId,undefined);
  const original={...p('原文小标题'),styleId:'Heading3'};
  assert.equal(manuscriptParagraph(original),original);
});
