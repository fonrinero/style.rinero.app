export const dynamic='force-dynamic';
export const runtime='nodejs';

export async function GET(){
  const team=process.env.STYLE_APPLE_TEAM_ID||'';
  const bundle=process.env.STYLE_IOS_BUNDLE_ID||'';
  if(!/^[A-Z0-9]{10}$/.test(team)||!/^[A-Za-z0-9.-]+$/.test(bundle))return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
  return Response.json({webcredentials:{apps:[`${team}.${bundle}`]}},{headers:{'Cache-Control':'public, max-age=300'}});
}
