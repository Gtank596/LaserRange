import './styles/app.css';
import { startRouter } from './app/router.js';
import { calibrateScreen } from './app/screens/calibrate.js';
import { cameraScreen } from './app/screens/camera.js';
import { historyScreen, sessionDetailScreen } from './app/screens/history.js';
import { homeScreen } from './app/screens/home.js';
import { labScreen } from './app/screens/lab.js';
import { printScreen } from './app/screens/print.js';
import { sessionScreen } from './app/screens/session.js';
import { registerServiceWorker } from './pwa/register.js';

registerServiceWorker();

startRouter(document.getElementById('app'), {
  '': homeScreen,
  calibrate: calibrateScreen,
  print: printScreen,
  camera: cameraScreen,
  lab: labScreen,
  session: sessionScreen,
  // #/history is the list; #/history/<id> is one session.
  history: (root, id) => (id ? sessionDetailScreen(root, id) : historyScreen(root)),
});
