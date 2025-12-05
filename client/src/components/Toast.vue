<template>
  <div :class="['toast', type]" @click="close">
    <p>{{ message }}</p>
  </div>
</template>

<script>
export default {
  name: 'Toast',
  props: {
    message: {
      type: String,
      required: true
    },
    type: {
      type: String,
      default: 'success',
      validator: (value) => ['success', 'error', 'warning'].includes(value)
    }
  },
  methods: {
    close() {
      this.$emit('close');
    }
  }
};
</script>

<style scoped>
.toast {
  cursor: pointer;
  min-width: 300px;
  max-width: 500px;
}

.toast p {
  margin: 0;
  font-size: 14px;
  color: var(--text-primary);
}
</style>

