import { mount } from 'svelte';
import '../../src/ui/theme.css';
import App from '../../src/ui/onboarding/App.svelte';

mount(App, { target: document.getElementById('app')! });
