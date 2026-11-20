const {expo}=require('./app.json');
const iosBundle=process.env.STYLE_IOS_BUNDLE_ID;
const androidPackage=process.env.STYLE_ANDROID_PACKAGE;

module.exports={
  ...expo,
  ios:{...expo.ios,...(iosBundle?{bundleIdentifier:iosBundle}:{}),...(iosBundle&&process.env.STYLE_APPLE_TEAM_ID?{associatedDomains:['webcredentials:style.rinero.app']}:{} )},
  android:{...expo.android,...(androidPackage?{package:androidPackage}:{})}
};
