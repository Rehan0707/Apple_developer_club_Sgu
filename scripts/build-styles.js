import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import forms from '@tailwindcss/forms';
import queries from '@tailwindcss/container-queries';
await mkdir('src/generated',{recursive:true});
for(const file of await readdir('styles')){
  if(!file.endsWith('.json'))continue;
  const config=JSON.parse(await readFile('styles/'+file,'utf8'));
  const name=file.replace('.json','');
  const page=name.replace('--','/')+'.html';
  const result=await postcss([tailwind({...config,content:[page,'src/*.js'],plugins:[forms,queries]})]).process('@tailwind base;\n@tailwind components;\n@tailwind utilities;',{from:undefined});
  await writeFile('src/generated/'+name+'.css',result.css);
}
