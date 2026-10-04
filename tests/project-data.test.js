import test from 'node:test';
import assert from 'node:assert/strict';
import {projectDetails} from '../lib/project-data.js';
test('project metadata accepts HTTPS demo links and optional link omission',()=>{
 assert.deepEqual(projectDetails({name:' App ',description:' Purpose ',url:'https://example.com/demo'}),{name:'App',description:'Purpose',url:'https://example.com/demo'});
 assert.equal(projectDetails({name:'App',description:'Purpose'}).url,'');
});
test('project metadata rejects missing descriptions, unsafe links and oversized fields',()=>{
 for(const value of [{name:'App'},{name:'App',description:'Purpose',url:'javascript:alert(1)'},{name:'App',description:'Purpose',url:'http://example.com'},{name:'a'.repeat(81),description:'Purpose'}])assert.throws(()=>projectDetails(value));
});
