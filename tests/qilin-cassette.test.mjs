import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harness } from '../netlify/functions/lib/qilin-cassette-test-harness.mjs';
import { createCassetteController } from '../public/cassette/controller.mjs';
import { cassette, emptyCassette, GUEST_KEY, accountKey } from '../public/cassette/schema.mjs';

const origin = 'https://cassette.test';
const example = () => ({ version:1, earned:['first_flight'], placed:{first_flight:{x:0.5,y:0.25,angle:0.12}} });
const changed = () => ({ version:1, earned:['first_flight','first_landing'], placed:{first_flight:{x:0.8,y:0.25,angle:-0.12}} });
function storage() {
  const data = new Map();
  return { getItem:k=>data.get(k)??null, setItem:(k,v)=>data.set(k,v), removeItem:k=>data.delete(k), data };
}
function browser(h) {
  let cookie = '';
  let failing = false;
  const fetcher = async (path, init = {}) => {
    const method = init.method || 'GET';
    if (failing && method === 'PUT') throw new TypeError('Network unavailable. Your local cassette is still here.');
    const headers = { ...init.headers, ...(cookie?{Cookie:cookie}:{}), ...(method!=='GET'?{Origin:origin}:{}) };
    const req = new Request(origin + path, { ...init, method, headers });
    const response = await h.routes[path](req,{});
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    return response;
  };
  return { fetcher, fail(value) { failing=value; }, async signin(email='cassette@example.test') {
    await fetcher('/api/auth/magic-link', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,next:'qilin'})});
    const link = h.mail.at(-1).magicLink;
    assert.equal(new URL(link).pathname,'/qilin-signin/');
    const token = new URLSearchParams(new URL(link).hash.slice(1)).get('token');
    assert.equal((await fetcher('/api/auth/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})})).status,200);
  }};
}
const setup = () => { const h=harness(origin), b=browser(h), s=storage(), backups=[]; const c=createCassetteController({storage:s,fetcher:b.fetcher,download:v=>backups.push(v)}); return {h,b,s,c,backups}; };
const localChange = (c,s,doc) => { s.setItem(c.storageKey,JSON.stringify(doc)); c.gameChanged(doc,true); };

test('guest earned sticker and placement survive email sign-in and a second independent device',async()=>{
  const {h,b,s,c}=setup(); await c.refresh();
  localChange(c,s,example());
  assert.equal(c.state.phase,'guest'); assert.equal(c.state.invitation,true);
  await b.signin(); await c.refresh();
  assert.equal(c.state.phase,'member'); assert.equal(c.state.saved,false);
  await c.save(); assert.equal(c.state.saved,true); assert.equal(s.getItem(GUEST_KEY),null);
  const device2=browser(h); await device2.signin();
  const second=createCassetteController({storage:storage(),fetcher:device2.fetcher,download:()=>{}});
  await second.refresh();
  assert.deepEqual(second.state.cassette,example()); assert.equal(second.state.saved,true);
});
test('established member without a game save gets guest transfer, not a fake empty account conflict',async()=>{
  const {b,s,c}=setup(); await b.signin(); await b.fetcher('/api/auth/logout',{method:'POST'});
  localChange(c,s,example()); await b.signin(); await c.refresh();
  assert.equal(c.state.conflict,null); assert.deepEqual(c.state.cassette,example());
  assert.equal(c.state.saved,false); await c.save(); assert.equal(c.state.saved,true);
});
test('cancelled sign-in changes neither guest design nor account storage and dismissal persists',async()=>{
  const {h,s,c}=setup(); await c.refresh(); localChange(c,s,example());
  c.openSignin(); c.cancelSignin();
  assert.equal(c.state.signinOpen,false); assert.deepEqual(c.state.cassette,example());
  assert.equal(h.stores.has('fandom-qilin-cassettes'),false);
  const reload=createCassetteController({storage:s,fetcher:browser(h).fetcher,download:()=>{}});
  await reload.refresh(); assert.equal(reload.state.invitation,false);
});
test('failed saves never claim account success and retry retains the same design',async()=>{
  const {b,s,c}=setup(); await b.signin(); await c.refresh(); localChange(c,s,example());
  b.fail(true); await c.save(); assert.equal(c.state.saved,false);
  assert.deepEqual(c.state.cassette,example()); assert.match(c.state.error,/Network/);
  b.fail(false); await c.save(); assert.equal(c.state.saved,true);
});
test('shared-device signout drops member view and cache without copying it to guest',async()=>{
  const {b,s,c}=setup(); await c.refresh(); localChange(c,s,example()); await b.signin(); await c.refresh(); await c.save();
  const memberKey=c.storageKey; assert.notEqual(memberKey,GUEST_KEY);
  await c.signout();
  assert.equal(c.storageKey,GUEST_KEY); assert.equal(c.state.user,null);
  assert.deepEqual(c.state.cassette,emptyCassette()); assert.equal(s.getItem(memberKey),null);
});
test('two devices cannot silently overwrite each other; cancelling a conflict is not permission to replace',async()=>{
  const {h,b,s,c}=setup(); await b.signin(); await c.refresh(); localChange(c,s,example()); await c.save();
  const b2=browser(h); await b2.signin(); const s2=storage();
  const c2=createCassetteController({storage:s2,fetcher:b2.fetcher,download:()=>{}});
  await c2.refresh(); localChange(c2,s2,changed()); await c2.save(); assert.equal(c2.state.saved,true);
  const edited=example(); edited.placed.first_flight.x=0.3;
  localChange(c,s,edited); await c.save();
  assert.ok(c.state.conflict); assert.equal(c.state.saved,false);
  assert.deepEqual(c.state.conflict.remote,changed());
  await c.choose('cancel'); assert.equal(c.state.conflict,null);
  await c.save(); assert.ok(c.state.conflict); // still asks before any write
  await c.choose('local'); assert.equal(c.state.saved,true);
  await c2.refresh(); assert.deepEqual(c2.state.conflict.remote,edited);
});
test('reload preserves dirty member-local copy and choosing account preserves the other copy as backup',async()=>{
  const {h,b,s,c,backups}=setup(); await b.signin(); await c.refresh(); localChange(c,s,example()); await c.save();
  localChange(c,s,changed());
  const reload=createCassetteController({storage:s,fetcher:b.fetcher,download:v=>backups.push(v)});
  await reload.refresh(); assert.deepEqual(reload.state.conflict.local,changed());
  await reload.choose('remote'); assert.deepEqual(reload.state.cassette,example());
  assert.deepEqual(backups.at(-1).cassette,changed());
});
test('server authenticates every save, checks origin, schema, account identity and stale revisions',async()=>{
  const {h,b}=setup();
  assert.equal((await b.fetcher('/api/qilin/cassette')).status,401);
  await b.signin(); const session=await (await b.fetcher('/api/auth/session')).json();
  const body={expectedAccountId:session.user.accountId,baseRevision:null,cassette:example()};
  const put=doc=>b.fetcher('/api/qilin/cassette',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(doc)});
  assert.equal((await put({...body,expectedAccountId:'someone-else'})).status,409);
  assert.equal((await put({...body,cassette:{...example(),earned:['imaginary']}})).status,400);
  assert.equal((await put(body)).status,200); assert.equal((await put(body)).status,409);
  assert.equal((await h.routes['/api/qilin/cassette'](new Request(origin+'/api/qilin/cassette',{method:'PUT',headers:{Origin:'https://other.test'}}),{})).status,403);
});
test('preview export/import transfers exact placements without any account and rejects malformed backups',async()=>{
  const {h,s,c,backups}=setup(); await c.refresh(); localChange(c,s,example()); c.exportBackup();
  const dest=createCassetteController({storage:storage(),fetcher:browser(h).fetcher,download:()=>{}});
  const backup=JSON.stringify(backups[0]);
  await dest.importBackup({size:backup.length,text:async()=>backup});
  assert.deepEqual(dest.state.cassette,example()); assert.equal(dest.state.saved,false);
  await dest.importBackup({size:80000,text:async()=>'{}'}); assert.match(dest.state.error,/8 KB/);
  assert.deepEqual(dest.state.cassette,example());
  assert.throws(()=>cassette({...example(),placed:{first_flight:{x:Infinity,y:0,angle:0}}}));
});
