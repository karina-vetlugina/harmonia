export class RippleStore {
  constructor() {
    this.items = [];
    this.subscribers = new Set();
  }

  subscribe(fn) {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  emit() {
    this.subscribers.forEach((fn) => fn());
  }

  replaceAll(items) {
    this.items = items;
    this.emit();
  }

  clear() {
    if (!this.items.length) return;
    this.items = [];
    this.emit();
  }
}
