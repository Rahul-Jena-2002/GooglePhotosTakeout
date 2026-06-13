import './index.css';
import { mount } from 'svelte';
import App from './App.svelte';

const target = document.getElementById('root')!;
target.innerHTML = '';
const app = mount(App, {
  target,
});

export default app;
