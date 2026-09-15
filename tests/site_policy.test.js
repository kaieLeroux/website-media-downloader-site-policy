const test = require('node:test');
const assert = require('node:assert/strict');
const Policy = require('../src/site_policy');
const { Coordinator } = require('../src/auto_archive');
const fixture = {policies:[
  {id:'video',domains:['video.example'],enabled:true,autoDownload:true,media:{video:true,audio:true,stream:true,image:'NONE',subtitle:true},drm:'SKIP',priority:1},
  {id:'music',domains:['music.video.example'],enabled:true,autoDownload:true,media:{video:true,audio:true,stream:true,image:'COVER_ONLY'},drm:'SKIP',priority:10},
  {id:'gallery',domains:['gallery.example'],enabled:true,autoDownload:true,media:{image:'ORIGINAL_ONLY'},drm:'SKIP'}
]};
Policy.configure(fixture);
test('allowlist matches roots and subdomains but not suffix attacks', () => {
  assert.equal(Policy.matchSitePolicy('https://video.example/watch/1').id, 'video');
  assert.equal(Policy.matchSitePolicy('https://www.video.example/watch/1').id, 'video');
  assert.equal(Policy.matchSitePolicy('https://music.video.example/watch/1').id, 'music');
  assert.equal(Policy.matchSitePolicy('https://video.example.attacker.invalid/'), null);
  assert.equal(Policy.matchSitePolicy('https://notvideo.example/'), null);
});
test('denied policy and DRM/segments/UI images are rejected without side effects', () => {
  const p = Policy.matchSitePolicy('https://gallery.example/works/1');
  assert.equal(Policy.shouldAcceptCandidate({url:'https://cdn.example/a.m4s'}, p), false);
  assert.equal(Policy.shouldAcceptCandidate({url:'https://cdn.example/a.mp4',drm:true}, p), false);
  assert.equal(Policy.shouldAcceptCandidate({url:'https://cdn.example/avatar.jpg',role:'artwork'}, p), false);
  let downloads=0; const c=new Coordinator(()=>downloads++,{setTimeout:()=>1,clearTimeout(){}});
  assert.equal(c.add({url:'https://cdn.example/a.mp4'}, null),false);
  assert.equal(c.groups.size,0); assert.equal(downloads,0);
});
test('highest quality wins and signed URLs deduplicate to one completed file', async () => {
  const p = {...Policy.matchSitePolicy('https://video.example/watch/1'),quietWindowMs:100,maxWaitMs:100};
  assert.equal(Policy.normalizeMediaUrl('https://cdn.example/a.mp4?token=one&x=1'), Policy.normalizeMediaUrl('https://cdn.example/a.mp4?token=two&x=1'));
  const got=[]; const clock={setTimeout:()=>1,clearTimeout(){}}; const c=new Coordinator(x=>{got.push(x);return true},clock);
  c.add({url:'https://cdn.example/a.mp4?token=one',pageUrl:'https://video.example/watch/1',width:640,height:360},p);
  c.add({url:'https://cdn.example/a.mp4?token=two',pageUrl:'https://video.example/watch/1',width:1920,height:1080},p);
  await c.flush([...c.groups.keys()][0]);
  assert.equal(got.length,1); assert.equal(got[0].height,1080);
  assert.equal(c.add({url:'https://cdn.example/a.mp4?token=three',pageUrl:'https://video.example/watch/1'},p),false);
});
test('HLS/DASH segments are rejected while one manifest reconstruction job is selected', () => {
  const p=Policy.matchSitePolicy('https://video.example/watch/1');
  assert.equal(Policy.selectBestCandidate([{url:'https://cdn.example/1.ts'},{url:'https://cdn.example/master.m3u8',type:'stream'}],p).url,'https://cdn.example/master.m3u8');
});
