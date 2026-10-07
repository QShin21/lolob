import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './director.css';
import './responsive.css';
import './studio-workflow.css';
import { UiThemeProvider } from './ui-theme';
import './console-system.css';
import './audience-system.css';
import './ui-theme.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><UiThemeProvider><App/></UiThemeProvider></React.StrictMode>);
