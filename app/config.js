// The app's settings. tools/fill.mjs writes the name, host, kit and Firebase project here; --web-config adds the web
// app's apiKey and appId (`firebase apps:sdkconfig WEB`). A public client config, not a secret: the Firestore rules
// decide who sees what. Until apiKey is set the app runs only against the local emulators (?emulator on localhost).
export const APP = {"name":"sandbox-app","title":"Sandbox app","host":"sandbox-app.flamingbeing.com"};
export const KIT = 'https://design.flamingbeing.com/v1/';
export const firebaseConfig = {
  "projectId": "sandbox-app-app",
  "authDomain": "sandbox-app.flamingbeing.com",
  "apiKey": "y",
  "appId": "x"
};
