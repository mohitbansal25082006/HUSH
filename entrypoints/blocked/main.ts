import { mount } from 'svelte';
import '../../src/ui/theme.css';
import App from '../../src/ui/blocked/App.svelte';

mount(App, { target: document.getElementById('app')! });
