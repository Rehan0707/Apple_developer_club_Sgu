import {api,live} from './client.js';
import {initializeApp} from 'firebase/app';
import {getAuth,GoogleAuthProvider,signInWithPopup,signOut as firebaseSignOut} from 'firebase/auth';
const statusText=document.getElementById('auth-status');
if(statusText){
  const apple=document.getElementById('apple-signin'),google=document.getElementById('google-signin'),preview=document.getElementById('local-preview'),signout=document.getElementById('signout');
  let firebaseAuth, googleMode;
  async function load(){
    try{
      const status=await api('/api/auth/status');
      googleMode=status.googleMode;
      if(googleMode==='firebase'&&!firebaseAuth)firebaseAuth=getAuth(initializeApp(status.firebaseConfig));
      const memberSignedIn=status.authenticated&&status.role==='student';
      apple.hidden=google.hidden=memberSignedIn;
      apple.disabled=!status.providers.apple;google.disabled=!status.providers.google;
      preview.hidden=!status.localPreview||memberSignedIn;
      document.getElementById('signout-wrap').hidden=!status.authenticated;
      const dashboardLink=document.querySelector('#signout-wrap a');
      dashboardLink.href=status.role==='admin'?'/admin/':'/student/';
      dashboardLink.textContent=status.role==='admin'?'Open admin dashboard →':'Open your member dashboard →';
      document.querySelector('.signed-in-heading').textContent=status.role==='admin'?'Administrator session active.':'You’re signed in.';
      const result=new URLSearchParams(location.search).get('auth');
      statusText.textContent=status.role==='admin'?'You’re signed in as an administrator. Choose Google or Preview locally to switch to the member portal.':memberSignedIn?'You’re signed in. Open your dashboard to see your events and badges.':result==='error'?'Sign-in could not be completed. Please try again.':result==='cancelled'?'Sign-in was cancelled. Choose an account whenever you’re ready.':result==='unavailable'?'That sign-in provider is not configured yet.':status.providers.apple||status.providers.google?'Choose your account to save your progress and collect event badges.':status.localPreview?'Account sign-in is awaiting configuration. You can explore with a local preview account below.':'Account sign-in will be available soon. Please contact the club for help.';
    }catch(error){apple.disabled=google.disabled=true;preview.hidden=true;statusText.textContent=error.message;}
  }
  apple.addEventListener('click',()=>{location.href='/api/auth/apple';});
  google.addEventListener('click',async()=>{
    if(googleMode!=='firebase'){location.href='/api/auth/google';return;}
    google.disabled=true;statusText.textContent='Connecting to Google…';
    try{
      const result=await signInWithPopup(firebaseAuth,new GoogleAuthProvider());
      await api('/api/auth/firebase',{method:'POST',body:JSON.stringify({idToken:await result.user.getIdToken(true)})});
      await firebaseSignOut(firebaseAuth).catch(()=>{});
      location.href='/student/';
    }catch(error){statusText.textContent=error.code==='auth/popup-closed-by-user'?'Sign-in was cancelled. Choose an account whenever you’re ready.':error.message||'Google sign-in could not be completed.';google.disabled=false;}
  });
  preview.addEventListener('click',async()=>{preview.disabled=true;try{await api('/api/auth/local-student',{method:'POST'});location.href='/student/';}catch(error){statusText.textContent=error.message;preview.disabled=false;}});
  signout.addEventListener('click',async()=>{signout.disabled=true;try{await api('/api/auth/signout',{method:'POST'});await load();}catch(error){statusText.textContent=error.message;}finally{signout.disabled=false;}});
  live(load);
}
