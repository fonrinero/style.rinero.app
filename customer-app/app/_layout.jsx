import { Stack } from 'expo-router';
import { StatusBar } from 'react-native';
import { useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { setNativeSession } from './session';

export default function Layout() {
  useEffect(() => { SecureStore.getItemAsync('style_session').then(setNativeSession).catch(() => setNativeSession(null)); }, []);
  return <><StatusBar barStyle="light-content"/><Stack screenOptions={{ headerShown:false, contentStyle:{backgroundColor:'#0b1118'} }}/></>;
}
