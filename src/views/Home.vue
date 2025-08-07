<script setup lang="ts">
import { ref, defineComponent } from 'vue'
import { useRouter } from 'vue-router'

// 定义多词组件名称
defineComponent({
  name: 'HomeView'
})

interface AppItem {
  id: number
  name: string
  icon: string
  route: string
  description: string
}

const router = useRouter()

const appList = ref<AppItem[]>([
  {
    id: 1,
    name: '天气应用',
    icon: '🌤️',
    route: '/weather',
    description: '查看天气预报和实时天气信息'
  },
  {
    id: 2,
    name: '待办事项',
    icon: '📝',
    route: '/todo',
    description: '管理您的日常任务和待办事项'
  },
  {
    id: 3,
    name: '计算器',
    icon: '🧮',
    route: '/calculator',
    description: '简单易用的计算器工具'
  },
  {
    id: 4,
    name: '笔记本',
    icon: '📓',
    route: '/notes',
    description: '记录和保存您的想法和笔记'
  },
  {
    id: 5,
    name: '相册',
    icon: '🖼️',
    route: '/gallery',
    description: '查看和管理您的照片'
  },
  {
    id: 6,
    name: '音乐播放器',
    icon: '🎵',
    route: '/music',
    description: '播放您喜爱的音乐'
  }
])

const navigateToApp = (route: string) => {
  router.push(route)
}
</script>

<template>
  <div class="home-container">
    <header class="header">
      <h1>应用中心</h1>
      <p>选择一个应用开始使用</p>
    </header>
    
    <main class="app-grid">
      <div 
        v-for="app in appList" 
        :key="app.id" 
        class="app-card"
        @click="navigateToApp(app.route)"
      >
        <div class="app-icon">{{ app.icon }}</div>
        <h2 class="app-name">{{ app.name }}</h2>
        <p class="app-description">{{ app.description }}</p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.home-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.header {
  text-align: center;
  margin-bottom: 3rem;
}

.header h1 {
  font-size: 2.5rem;
  color: #2c3e50;
  margin-bottom: 0.5rem;
}

.header p {
  font-size: 1.2rem;
  color: #7f8c8d;
}

.app-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 2rem;
}

.app-card {
  background-color: #fff;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.app-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 15px rgba(0, 0, 0, 0.1);
}

.app-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.app-name {
  font-size: 1.5rem;
  color: #2c3e50;
  margin-bottom: 0.5rem;
}

.app-description {
  color: #7f8c8d;
  font-size: 0.9rem;
}
</style>