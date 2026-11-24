import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans-condensed/latin-500.css';
import '@fontsource/ibm-plex-sans-condensed/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import '@fontsource-variable/noto-sans-sc/wght.css';
import '@fontsource-variable/noto-serif-sc/wght.css';
import './styles.css';
import { UiThemeProvider } from './ui-theme';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><UiThemeProvider><App/></UiThemeProvider></React.StrictMode>);
