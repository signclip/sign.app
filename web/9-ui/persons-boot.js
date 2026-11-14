// persons-boot.js — the first import of app.js: several persons on one device (persons.js) are set up before
// anything reads the browser storage. Nothing else here.
import { installPersons } from './persons.js';

installPersons();
