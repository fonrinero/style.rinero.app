import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { getNativeSession, setNativeSession } from './session';

const API=process.env.EXPO_PUBLIC_STYLE_API_URL||'https://style.rinero.app';
const headers={'Content-Type':'application/json','X-Style-Client':'native'};
async function request(path,body,token) {
  const h={...headers}; if(token)h.Authorization=`Bearer ${token}`;
  const response=await fetch(`${API}/api/v1/auth/${path}`,{method:'POST',headers:h,body:JSON.stringify(body)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'The account service is temporarily unavailable.');
  return data;
}
async function persistSession(data) {
  if(!data.session_token)throw new Error('The account service did not return a sign-in session.');
  await SecureStore.setItemAsync('style_session',data.session_token);
  setNativeSession(data.session_token);
  return data.user;
}
function jsonCredential(credential) {
  if(!credential)return null;
  const plain=JSON.parse(JSON.stringify(credential));
  if(typeof credential.response?.getPublicKey==='function')plain.response.publicKey=credential.response.getPublicKey();
  return plain;
}

export default function Account(){
  const router=useRouter();
  const [mode,setMode]=useState('signin');
  const [email,setEmail]=useState(''); const [password,setPassword]=useState('');
  const [name,setName]=useState(''); const [phone,setPhone]=useState(''); const [code,setCode]=useState('');
  const [grant,setGrant]=useState(''); const [user,setUser]=useState(null);
  const [busy,setBusy]=useState(false); const [message,setMessage]=useState(''); const [error,setError]=useState('');

  useEffect(()=>{
    let active=true;
    SecureStore.getItemAsync('style_session').then(token=>{
      if(!token||!active)return;
      setNativeSession(token);
      return fetch(`${API}/api/v1/auth/me`,{headers:{'X-Style-Client':'native',Authorization:`Bearer ${token}`}})
      .then(async r=>{if(!r.ok)throw new Error('');return r.json()})
      .then(data=>{if(active)setUser(data.user)})
      .catch(()=>{if(active){SecureStore.deleteItemAsync('style_session').catch(()=>{});setNativeSession(null)}});
    }).catch(()=>{});
    return()=>{active=false};
  },[]);

  async function run(fn){setBusy(true);setError('');setMessage('');try{await fn()}catch(e){setError(e.message||'Please try again.')}finally{setBusy(false)}}
  async function signIn(){
    await run(async()=>{const data=await request('password/login',{email:email.trim().toLowerCase(),password});setUser(await persistSession(data));});
  }
  async function sendCode(){
    await run(async()=>{await request('email/request',{email:email.trim().toLowerCase()});setMode('verify');setMessage('If this email can be used, we sent a six digit code. Check your inbox.');});
  }
  async function verifyCode(){
    await run(async()=>{const data=await request('email/native-verify',{email:email.trim().toLowerCase(),code:code.trim()});setGrant(data.registration_grant);setMode('register');setMessage('Email verified. Finish creating your account.');});
  }
  async function signInWithPasskey(){
    await run(async()=>{if(!email.trim())throw new Error('Enter your email address first.');const passkeys=await import('react-native-passkeys');if(!passkeys.isSupported())throw new Error('Passkeys need the installed Style by Rinero app and a compatible device.');const options=await request('login/options',{email:email.trim().toLowerCase()});const credential=await passkeys.get(options);if(!credential)return;const data=await request('login/verify',jsonCredential(credential));setUser(await persistSession(data));});
  }
  async function createPasskeyAccount(){
    await run(async()=>{const passkeys=await import('react-native-passkeys');if(!passkeys.isSupported())throw new Error('Passkeys need the installed Style by Rinero app and a compatible device.');const options=await request('register/options',{email:email.trim().toLowerCase(),display_name:name.trim(),phone:phone.trim(),account_type:'customer'},grant);const credential=await passkeys.create(options);if(!credential)return;const data=await request('register/verify',jsonCredential(credential),grant);setUser(await persistSession(data));});
  }
  async function register(){
    await run(async()=>{const data=await request('password/register',{email:email.trim().toLowerCase(),password,display_name:name.trim(),phone:phone.trim()},grant);setUser(await persistSession(data));});
  }
  async function signOut(){
    await run(async()=>{const token=getNativeSession();if(token)await request('logout',{},token);await SecureStore.deleteItemAsync('style_session');setNativeSession(null);setUser(null);setPassword('');setMode('signin')});
  }

  return <KeyboardAvoidingView style={s.root} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
    <Link href="/" style={s.back}>← Style by Rinero</Link>
    <Text style={s.eyebrow}>YOUR STYLE, YOUR ACCOUNT</Text>
    {user?<><Text style={s.title}>You’re signed in.</Text><Text style={s.copy}>{user.display_name}{'\n'}{user.email}</Text><Pressable onPress={()=>router.replace('/')} style={s.button}><Text style={s.buttonText}>Continue exploring</Text></Pressable><Pressable disabled={busy} onPress={signOut} style={s.secondary}><Text style={s.secondaryText}>{busy?'Signing out…':'Sign out'}</Text></Pressable></>:<>
      <Text style={s.title}>{mode==='signin'?'Welcome back.':mode==='verify'?'Check your email.':mode==='register'?'Create your account.':'Join Style by Rinero.'}</Text>
      <Text style={s.copy}>{mode==='signin'?'Sign in with your email and password.':mode==='verify'?'Enter the six digit code we sent you.':mode==='register'?'Your email is verified. Add your details to finish.':'One account for your favourite local professionals.'}</Text>
      <TextInput style={s.input} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="Email address" placeholderTextColor="#91a3af" editable={mode!=='register'&&mode!=='verify'}/>
      {mode==='verify'&&<TextInput style={s.input} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} placeholder="Six digit code" placeholderTextColor="#91a3af"/>}
      {mode==='register'&&<><TextInput style={s.input} value={name} onChangeText={setName} autoComplete="name" placeholder="First and last name" placeholderTextColor="#91a3af"/><TextInput style={s.input} value={phone} onChangeText={setPhone} autoComplete="tel" keyboardType="phone-pad" placeholder="Phone number with country code" placeholderTextColor="#91a3af"/></>}
      {(mode==='signin'||mode==='register')&&<TextInput style={s.input} value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode==='signin'?'current-password':'new-password'} placeholder="Password (10 characters minimum)" placeholderTextColor="#91a3af"/>}
      {mode==='signin'?<>
        <Pressable disabled={busy} onPress={signIn} style={s.button}>{busy?<ActivityIndicator color="#15191d"/>:<Text style={s.buttonText}>Sign in</Text>}</Pressable>
        <Pressable disabled={busy} onPress={signInWithPasskey} style={s.secondary}>{busy?<ActivityIndicator color="#f4f6f7"/>:<Text style={s.secondaryText}>Sign in with a passkey</Text>}</Pressable>
        <Pressable onPress={()=>{setMode('start');setError('');setMessage('')}} style={s.textButton}><Text style={s.textButtonText}>Create a new account</Text></Pressable>
      </>:mode==='start'?<><Pressable disabled={busy} onPress={sendCode} style={s.button}>{busy?<ActivityIndicator color="#15191d"/>:<Text style={s.buttonText}>Email me a verification code</Text>}</Pressable><Pressable onPress={()=>setMode('signin')} style={s.textButton}><Text style={s.textButtonText}>I already have an account</Text></Pressable></>:mode==='verify'?<><Pressable disabled={busy} onPress={verifyCode} style={s.button}>{busy?<ActivityIndicator color="#15191d"/>:<Text style={s.buttonText}>Verify email</Text>}</Pressable><Pressable onPress={sendCode} style={s.textButton}><Text style={s.textButtonText}>Send a new code</Text></Pressable></>:<><Pressable disabled={busy} onPress={register} style={s.button}>{busy?<ActivityIndicator color="#15191d"/>:<Text style={s.buttonText}>Create account with password</Text>}</Pressable><Pressable disabled={busy} onPress={createPasskeyAccount} style={s.secondary}><Text style={s.secondaryText}>Create account with a passkey</Text></Pressable></>}
      {message? <Text accessibilityLiveRegion="polite" style={s.message}>{message}</Text>:null}{error?<Text accessibilityLiveRegion="assertive" style={s.error}>{error}</Text>:null}
      <View style={s.security}><Text style={s.securityTitle}>Your account, protected</Text><Text style={s.securityCopy}>Email verification is required for new accounts. Passwords are stored as salted hashes, and app sessions are kept in your device’s secure storage.</Text></View>
    </>}
  </ScrollView></KeyboardAvoidingView>
}

const s=StyleSheet.create({root:{flex:1,backgroundColor:'#0b1118'},page:{padding:24,paddingTop:60,paddingBottom:60,gap:15},back:{color:'#38cad9',fontWeight:'700',marginBottom:26},eyebrow:{fontSize:10,color:'#38cad9',fontWeight:'800',letterSpacing:1.5},title:{fontSize:38,lineHeight:43,color:'#f4f6f7',fontWeight:'800',letterSpacing:-1.3,marginTop:4},copy:{fontSize:15,lineHeight:23,color:'#a6b5bf',marginBottom:10},input:{backgroundColor:'#14212c',borderColor:'#2a4050',borderWidth:1,borderRadius:13,color:'#f4f6f7',padding:16,fontSize:15},button:{backgroundColor:'#ff9147',borderRadius:13,padding:17,alignItems:'center',minHeight:54,justifyContent:'center'},buttonText:{color:'#15191d',fontWeight:'800',fontSize:16},secondary:{borderColor:'#34495a',borderWidth:1,borderRadius:12,padding:15,alignItems:'center'},secondaryText:{color:'#f4f6f7',fontWeight:'700'},textButton:{alignItems:'center',padding:10},textButtonText:{color:'#38cad9',fontWeight:'700'},passkeyNote:{fontSize:12,lineHeight:18,color:'#91a3af',textAlign:'center'},message:{color:'#73d7ba',lineHeight:20},error:{color:'#ff998d',lineHeight:20},security:{marginTop:34,padding:16,borderColor:'#263744',borderWidth:1,borderRadius:14,backgroundColor:'#101a23',gap:7},securityTitle:{color:'#f4f6f7',fontWeight:'800'},securityCopy:{color:'#93a5b1',fontSize:12,lineHeight:18}});
