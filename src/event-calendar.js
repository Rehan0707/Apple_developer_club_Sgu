const text=value=>String(value||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
export const calendarDate=value=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
export function eventCalendar(row,stamp=Date.now()) {
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Apple Developer Club SGU//Events//EN','BEGIN:VEVENT',`UID:${row.registrationId}@sgu-club`,`DTSTAMP:${calendarDate(stamp)}`,`DTSTART:${calendarDate(row.date)}`,`SUMMARY:${text(row.title)}`,`DESCRIPTION:${text(row.description||'Apple Developer Club SGU event')}`,`LOCATION:${text(row.location)}`,'BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:Club event reminder','TRIGGER:-PT30M','END:VALARM','END:VEVENT','END:VCALENDAR'];
 // Fold long lines by UTF-8 byte length for calendar applications.
 const encoder=new TextEncoder();return lines.map(line=>{let result='',part='';for(const char of line){if(encoder.encode(part+char).length>75){result+=part+'\r\n';part=' ';}part+=char;}return result+part;}).join('\r\n')+'\r\n';
}
