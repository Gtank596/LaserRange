import './styles/app.css';
import { startRouter } from './app/router.js';
import { calibrateScreen } from './app/screens/calibrate.js';
import { cameraScreen } from './app/screens/camera.js';
import { homeScreen } from './app/screens/home.js';
import { labScreen } from './app/screens/lab.js';
import { historyScreen, sessionScreen } from './app/screens/placeholders.js';
import { printScreen } from './app/screens/print.js';

startRouter(document.getElementById('app'), {
  '': homeScreen,
  calibrate: calibrateScreen,
  print: printScreen,
  camera: cameraScreen,
  lab: labScreen,
  session: sessionScreen,
  history: historyScreen,
});
