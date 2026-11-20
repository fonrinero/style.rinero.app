export const dynamic='force-dynamic';
export const runtime='nodejs';

export async function GET(){
  const packageName=process.env.STYLE_ANDROID_PACKAGE||'';
  const fingerprints=(process.env.STYLE_ANDROID_SHA256_FINGERPRINTS||'').split(',').map(value=>value.trim().toUpperCase()).filter(Boolean);
  if(!/^[A-Za-z0-9_.]+$/.test(packageName)||!fingerprints.length||fingerprints.some(value=>!/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(value)))return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
  return Response.json([{relation:['delegate_permission/common.handle_all_urls','delegate_permission/common.get_login_creds'],target:{namespace:'android_app',package_name:packageName,sha256_cert_fingerprints:fingerprints}}],{headers:{'Cache-Control':'public, max-age=300'}});
}
