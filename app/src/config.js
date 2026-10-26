// The app's settings. tools/fill.mjs writes the name, host, kit and Firebase project here; --web-config adds the web
// app's apiKey and appId (`firebase apps:sdkconfig WEB`). A public client config, not a secret: the Firestore rules
// decide who sees what. Until apiKey is set the app runs only against the local emulators (?emulator on localhost).
// accent: the default look's colour (@core/theme; boot.js), set with --accent.
export const APP = {"name":"sandbox-app","title":"Sandbox app","host":"sandbox-app.flamingbeing.com","accent":"#3a6390"};
export const KIT = 'https://design.flamingbeing.com/v1/';
export const firebaseConfig = {
  "projectId": "sandbox-app-app",
  "authDomain": "sandbox-app.flamingbeing.com",
  "apiKey": "AIzaSyA0JwJX3PSwg-_uEZJRLqx7A57S-4uKZy4",
  "appId": "1:28054845122:web:05735c5cae0829e7b3ed5b",
  "storageBucket": "sandbox-app-app.firebasestorage.app",
  "messagingSenderId": "28054845122"
};
