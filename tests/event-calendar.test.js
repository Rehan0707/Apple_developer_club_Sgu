import test from 'node:test';
import assert from 'node:assert/strict';
import {eventCalendar} from '../src/event-calendar.js';
test('calendar preserves UTC schedule, escapes text and includes a 30-minute reminder',()=>{
 const output=eventCalendar({registrationId:'one',date:'2026-10-06T10:00:00+05:30',title:'Swift, UI;\nWorkshop',location:'Lab',description:'Build apps'},0);
 assert(output.includes('DTSTART:20261006T043000Z'));
 assert(output.includes('SUMMARY:Swift\\, UI\\;\\nWorkshop'));
 assert(output.includes('TRIGGER:-PT30M'));
 assert(output.includes('UID:one@sgu-club'));
});
test('calendar folds multibyte descriptions within calendar line limits',()=>{
 const output=eventCalendar({registrationId:'one',date:'2026-10-06',title:'App',description:'✨'.repeat(100)},0);
 for(const line of output.split('\r\n'))assert(Buffer.byteLength(line)<=75);
 assert(output.replace(/\r\n /g,'').includes('DESCRIPTION:'+'✨'.repeat(100)));
});
