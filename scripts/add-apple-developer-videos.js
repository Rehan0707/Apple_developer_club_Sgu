import { readFileSync } from 'node:fs';

const origin = process.env.PUBLIC_ORIGIN || 'http://127.0.0.1:3001';
const access = readFileSync('.local-access.txt', 'utf8');
const username = access.match(/^Username: (.+)$/m)?.[1];
const password = access.match(/^Password: (.+)$/m)?.[1];
if (!username || !password) throw new Error('Local admin credentials are missing.');

const videos = [
  { title: 'What’s new in SwiftUI', category: 'Swift UI', url: 'https://www.youtube.com/watch?v=cETgTtu6atM', desc: 'Apple Developer · WWDC25. Explore SwiftUI updates, performance improvements, and new capabilities.' },
  { title: 'Build a SwiftUI app with the new design', category: 'Swift UI', url: 'https://www.youtube.com/watch?v=3MugGCtm26A', desc: 'Apple Developer · WWDC25. Build an app with the latest SwiftUI design and controls.' },
  { title: 'Design foundations from idea to interface', category: 'Design', url: 'https://www.youtube.com/watch?v=dGcqqA3Sl-o', desc: 'Apple Developer · WWDC25. Learn structure, navigation, content, and visual design principles.' },
  { title: 'Design with SwiftUI', category: 'Design', url: 'https://www.youtube.com/watch?v=TT3p6hlHWJI', desc: 'Apple Developer · WWDC23. Explore design ideas and iterate with SwiftUI.' },
  { title: 'What’s new in Xcode 26', category: 'Developer Tools', url: 'https://www.youtube.com/watch?v=3wzUNua-JKg', desc: 'Apple Developer · WWDC25. Tour editing, debugging, performance, builds, and testing in Xcode.' },
  { title: 'What’s new in App Store Connect', category: 'App Store', url: 'https://www.youtube.com/watch?v=41T0PEPZyHQ', desc: 'Apple Developer · WWDC25. Learn about build delivery, TestFlight, discovery, and app management.' },
];

const login = await fetch(`${origin}/api/auth/admin`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
if (!login.ok) throw new Error(`Admin sign-in failed: ${login.status}`);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
const existingResponse = await fetch(`${origin}/api/resources`);
if (!existingResponse.ok) throw new Error(`Could not read resources: ${existingResponse.status}`);
const existing = await existingResponse.json();
let added = 0;
for (const video of videos) {
  if (existing.some(resource => resource.url === video.url)) continue;
  const response = await fetch(`${origin}/api/admin/resources`, { method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(video) });
  if (!response.ok) throw new Error(`Could not add ${video.title}: ${response.status}`);
  added++;
}
console.log(`Added ${added} Apple Developer videos; ${videos.length - added} already present.`);
