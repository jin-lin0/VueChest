<script setup lang="ts">
import { ref, defineComponent, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'

// 定义多词组件名称
defineComponent({
  name: 'TodoView'
})

interface TodoItem {
  id: number
  text: string
  completed: boolean
  createdAt: string // 改为字符串类型，方便JSON序列化
}

const router = useRouter()

const goBack = () => {
  router.push('/')
}

const newTodo = ref('')
const todos = ref<TodoItem[]>([])

// 从localStorage加载数据
const loadTodos = (): TodoItem[] => {
  const savedTodos = localStorage.getItem('todos')
  if (savedTodos) {
    try {
      return JSON.parse(savedTodos)
    } catch (e) {
      console.error('解析待办事项数据失败:', e)
      return []
    }
  }
  return [
    {
      id: 1,
      text: '完成Vue项目',
      completed: false,
      createdAt: new Date().toISOString()
    },
    {
      id: 2,
      text: '学习TypeScript',
      completed: true,
      createdAt: new Date().toISOString()
    },
    {
      id: 3,
      text: '购买生活用品',
      completed: false,
      createdAt: new Date().toISOString()
    }
  ]
}

// 保存数据到localStorage
const saveTodos = () => {
  localStorage.setItem('todos', JSON.stringify(todos.value))
}

// 组件挂载时加载数据
onMounted(() => {
  todos.value = loadTodos()
})

// 监听todos变化，自动保存
watch(todos, () => {
  saveTodos()
}, { deep: true })

const addTodo = () => {
  if (newTodo.value.trim()) {
    todos.value.push({
      id: Date.now(),
      text: newTodo.value,
      completed: false,
      createdAt: new Date().toISOString()
    })
    newTodo.value = ''
  }
}

const toggleTodo = (id: number) => {
  const todo = todos.value.find(item => item.id === id)
  if (todo) {
    todo.completed = !todo.completed
  }
}

const removeTodo = (id: number) => {
  todos.value = todos.value.filter(item => item.id !== id)
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <button class="back-button" @click="goBack">返回</button>
      <h1>待办事项</h1>
    </header>
    
    <main class="todo-content">
      <div class="add-todo">
        <input 
          v-model="newTodo" 
          type="text" 
          placeholder="添加新的待办事项..."
          @keyup.enter="addTodo"
        >
        <button @click="addTodo">添加</button>
      </div>
      
      <div class="todo-list">
        <div 
          v-for="todo in todos" 
          :key="todo.id" 
          class="todo-item"
          :class="{ 'completed': todo.completed }"
        >
          <div class="todo-checkbox">
            <input 
              type="checkbox" 
              :checked="todo.completed"
              @change="toggleTodo(todo.id)"
            >
          </div>
          <div class="todo-details">
            <div class="todo-text">{{ todo.text }}</div>
            <div class="todo-date">{{ formatDate(todo.createdAt) }}</div>
          </div>
          <button class="delete-btn" @click="removeTodo(todo.id)">
            删除
          </button>
        </div>
        
        <div v-if="todos.length === 0" class="empty-state">
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

.back-button {
  background-color: #3498db;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  margin-right: 1rem;
  font-size: 1rem;
}

.back-button:hover {
  background-color: #2980b9;
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
</style>