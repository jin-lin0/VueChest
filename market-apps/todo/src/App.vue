<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useTodoStore } from './store'

const todoStore = useTodoStore()
const newTodo = ref('')

onMounted(() => {
  todoStore.init()
})

const addTodo = () => {
  if (newTodo.value.trim()) {
    todoStore.addTodo(newTodo.value)
    newTodo.value = ''
  }
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

const goBack = () => {
  history.back()
}
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <button class="back-btn" @click="goBack">← 返回</button>

      <h1>📝 待办事项</h1>
    </header>

    <main class="todo-content">
      <div class="add-todo">
        <input
          v-model="newTodo"
          type="text"
          placeholder="添加新的待办事项..."
          @keyup.enter="addTodo"
        />
        <button @click="addTodo">添加</button>
      </div>

      <div class="todo-list">
        <div
          v-for="todo in todoStore.todos"
          :key="todo.id"
          class="todo-item"
          :class="{ completed: todo.completed }"
        >
          <div class="todo-checkbox">
            <input
              type="checkbox"
              :checked="todo.completed"
              @change="todoStore.toggleTodo(todo.id)"
            />
          </div>
          <div class="todo-details">
            <div class="todo-text">{{ todo.text }}</div>
            <div class="todo-date">{{ formatDate(todo.createdAt) }}</div>
          </div>
          <button class="delete-btn" @click="todoStore.removeTodo(todo.id)">删除</button>
        </div>

        <div v-if="todoStore.todos.length === 0" class="empty-state">
          没有待办事项，添加一个吧！
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.app-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}
.app-header {
  display: flex;
  align-items: center;
  margin-bottom: 2rem;
}
.app-header h1 {
  margin: 0;
  font-size: 2rem;
  color: #2c3e50;
}
.add-todo {
  display: flex;
  margin-bottom: 2rem;
}
.add-todo input {
  flex: 1;
  padding: 0.8rem;
  border: 1px solid #ddd;
  border-radius: 4px 0 0 4px;
  font-size: 1rem;
}
.add-todo button {
  background-color: #2ecc71;
  color: white;
  border: none;
  padding: 0 1.5rem;
  border-radius: 0 4px 4px 0;
  cursor: pointer;
  font-size: 1rem;
}
.add-todo button:hover {
  background-color: #27ae60;
}
.todo-list {
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}
.todo-item {
  display: flex;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid #eee;
  transition: background-color 0.2s;
}
.todo-item:last-child {
  border-bottom: none;
}
.todo-item:hover {
  background-color: #f9f9f9;
}
.todo-item.completed .todo-text {
  text-decoration: line-through;
  color: #95a5a6;
}
.todo-checkbox {
  margin-right: 1rem;
}
.todo-checkbox input {
  width: 18px;
  height: 18px;
  cursor: pointer;
}
.todo-details {
  flex: 1;
}
.todo-text {
  font-size: 1.1rem;
  margin-bottom: 0.3rem;
  color: #2c3e50;
}
.todo-date {
  font-size: 0.8rem;
  color: #95a5a6;
}
.delete-btn {
  background-color: #e74c3c;
  color: white;
  border: none;
  padding: 0.4rem 0.8rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}
.delete-btn:hover {
  background-color: #c0392b;
}
.empty-state {
  padding: 2rem;
  text-align: center;
  color: #7f8c8d;
  font-style: italic;
}
.back-btn {
  background: #3498db;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  margin-right: 1rem;
  font-size: 1rem;
}
.back-btn:hover {
  background: #2980b9;
}

@media (max-width: 768px) {
  .app-container {
    padding: 1rem;
  }
  .app-header h1 {
    font-size: 1.4rem;
  }
  .add-todo {
    flex-direction: column;
  }
  .add-todo input {
    border-radius: 4px;
    margin-bottom: 0.5rem;
  }
  .add-todo button {
    border-radius: 4px;
    padding: 0.7rem;
  }
  .todo-item {
    padding: 0.8rem;
    flex-wrap: wrap;
  }
  .todo-details {
    min-width: 0;
  }
  .todo-text {
    font-size: 1rem;
  }
  .delete-btn {
    padding: 0.35rem 0.6rem;
    font-size: 0.8rem;
  }
}
</style>
