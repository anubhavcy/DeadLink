// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAT-qbN8Y7ViroKuCiaHdXdGtoTZbdZ-Mk",
  authDomain: "dead-link-e7bf4.firebaseapp.com",
  projectId: "dead-link-e7bf4",
  storageBucket: "dead-link-e7bf4.firebasestorage.app",
  messagingSenderId: "390294139024",
  appId: "1:390294139024:web:bd6275a015e646f797a815",
  measurementId: "G-RLNYVW4618"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
