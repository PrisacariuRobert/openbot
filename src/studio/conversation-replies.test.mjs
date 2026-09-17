import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationReplies } from './conversation-replies.mjs';
const message = (threadId, id='message-1') => ({threadId,id,senderName:'Pixel',body:'Keep the conversation.',kind:'text'});
test('reply selections remain scoped when switching conversations',()=>{
 const store=new ConversationReplies(); store.choose('pixel',message('pixel'));
 store.choose('scout',message('scout','other'));
 assert.equal(store.view('pixel').id,'message-1'); assert.equal(store.view('scout').id,'other');
 assert.equal(store.view('nova'),null);
});
test('cross-thread targets and system events are not quotable',()=>{
 const store=new ConversationReplies();
 assert.equal(store.choose('pixel',message('scout')),false);
 assert.equal(store.choose('pixel',{...message('pixel'),kind:'event'}),false);
 assert.equal(store.view('pixel'),null);
});
test('an acknowledged send clears only its captured quote',()=>{
 const store=new ConversationReplies();store.choose('pixel',message('pixel'));
 const captured=store.capture('pixel');store.choose('scout',message('scout'));
 store.clearSent(captured);assert.equal(store.view('pixel'),null);assert.ok(store.view('scout'));
});
test('a delayed acknowledgement never clears a newer choice of the same message',()=>{
 const store=new ConversationReplies();store.choose('pixel',message('pixel'));
 const captured=store.capture('pixel');store.choose('pixel',message('pixel'));
 store.clearSent(captured);assert.ok(store.view('pixel'));
});
test('failed send preserves the quote; cancel does not affect other drafts',()=>{
 const store=new ConversationReplies();store.choose('pixel',message('pixel'));store.choose('scout',message('scout'));
 store.capture('pixel');assert.ok(store.view('pixel'));store.clear('pixel');assert.ok(store.view('scout'));
});
test('reply previews are bounded and not mutable aliases',()=>{
 const store=new ConversationReplies();const original={...message('pixel'),body:'x'.repeat(2500)};
 store.choose('pixel',original);original.body='changed';
 assert.equal(store.view('pixel').body.length,500);assert.ok(Object.isFrozen(store.view('pixel')));
});
