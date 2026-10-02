/* Optional online ranking. Learning and local challenges never depend on this. */
(function () {
  let ready, appCheckStarted = false;
  function script(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.onload = resolve;
      el.onerror = () => reject(Error("network"));
      document.head.appendChild(el);
    });
  }
  window.HKCloud = {
    connect() {
      if (!ready)
        ready = (async () => {
          const base = "https://www.gstatic.com/firebasejs/9.23.0/";
          if (!window.firebase) await script(base + "firebase-app-compat.js");
          if (!firebase.auth) await script(base + "firebase-auth-compat.js");
          if (!firebase.firestore)
            await script(base + "firebase-firestore-compat.js");
          if (!firebase.appCheck)
            await script(base + "firebase-app-check-compat.js");
          if (!firebase.apps.length)
            firebase.initializeApp({
              apiKey: "AIzaSyBMcXnMxiHXg2ybI2aNrpJozN_MlDpH0lA",
              authDomain: "historykids-62240.firebaseapp.com",
              projectId: "historykids-62240",
              storageBucket: "historykids-62240.firebasestorage.app",
              messagingSenderId: "73567574639",
              appId: "1:73567574639:web:c5e91d53c479a55b708b9a",
            });
          if (!appCheckStarted) {
            firebase.appCheck().activate("6LfoXPMrAAAAAO98VYU17M8PFwpz4pv_k2k0ngIk", true);
            appCheckStarted = true;
          }
          const auth = firebase.auth();
          await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
          if (!auth.currentUser) await auth.signInAnonymously();
          return { auth, db: firebase.firestore(), firebase };
        })().catch((error) => { ready = null; throw error; });
      return ready;
    },
  };
})();

