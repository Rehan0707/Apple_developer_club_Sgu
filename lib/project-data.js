export function projectDetails(value) {
  const field=(key,max,required=false)=>{const v=value[key]??'';if(typeof v!=='string'||v.trim().length>max||(required&&!v.trim()))throw new Error(`Please enter a valid ${key}.`);return v.trim();};
  const name=field('name',80,true),description=field('description',1000,true),url=field('url',2048);
  if(url){let parsed;try{parsed=new URL(url);}catch{}if(parsed?.protocol!=='https:')throw new Error('The app link must use HTTPS.');}
  return {name,description,url};
}
