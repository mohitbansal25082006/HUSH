import { mount } from 'svelte';
import '../../src/ui/theme.css';
import '../../src/ui/dashboard/dashboard.css';
import App from '../../src/ui/dashboard/App.svelte';

mount(App, { target: document.getElementById('app')! });
