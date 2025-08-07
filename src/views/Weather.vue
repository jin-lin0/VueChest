<script setup lang="ts">
import { ref, defineComponent } from 'vue'
import { useRouter } from 'vue-router'

// 定义多词组件名称
defineComponent({
  name: 'WeatherView'
})

const router = useRouter()

const goBack = () => {
  router.push('/')
}

const currentWeather = ref({
  temperature: 23,
  condition: '晴朗',
  humidity: 45,
  windSpeed: 10
})

const forecast = ref([
  { day: '周一', high: 24, low: 18, condition: '☀️' },
  { day: '周二', high: 26, low: 19, condition: '⛅' },
  { day: '周三', high: 25, low: 17, condition: '🌧️' },
  { day: '周四', high: 22, low: 16, condition: '🌧️' },
  { day: '周五', high: 24, low: 18, condition: '⛅' }
])
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <button class="back-button" @click="goBack">返回</button>
      <h1>天气应用</h1>
    </header>
    
    <main class="weather-content">
      <section class="current-weather">
        <h2>当前天气</h2>
        <div class="weather-card">
          <div class="temperature">{{ currentWeather.temperature }}°C</div>
          <div class="condition">{{ currentWeather.condition }}</div>
          <div class="details">
            <p>湿度: {{ currentWeather.humidity }}%</p>
            <p>风速: {{ currentWeather.windSpeed }} km/h</p>
          </div>
        </div>
      </section>
      
      <section class="forecast">
        <h2>未来天气预报</h2>
        <div class="forecast-container">
          <div 
            v-for="(day, index) in forecast" 
            :key="index" 
            class="forecast-day"
          >
            <div class="day-name">{{ day.day }}</div>
            <div class="day-condition">{{ day.condition }}</div>
            <div class="day-temp">
              <span class="high">{{ day.high }}°</span>
              <span class="low">{{ day.low }}°</span>
            </div>
          </div>
        </div>
      </section>
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

.weather-content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

section h2 {
  margin-top: 0;
  margin-bottom: 1rem;
  color: #2c3e50;
}

.current-weather .weather-card {
  background-color: #fff;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  text-align: center;
}

.temperature {
  font-size: 4rem;
  font-weight: bold;
  color: #e74c3c;
  margin-bottom: 0.5rem;
}

.condition {
  font-size: 1.5rem;
  color: #2c3e50;
  margin-bottom: 1.5rem;
}

.details {
  display: flex;
  justify-content: space-around;
}

.details p {
  margin: 0;
  color: #7f8c8d;
}

.forecast-container {
  display: flex;
  justify-content: space-between;
  background-color: #fff;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.forecast-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
}

.day-name {
  font-weight: bold;
  margin-bottom: 0.5rem;
  color: #2c3e50;
}

.day-condition {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
}

.day-temp {
  display: flex;
  gap: 0.5rem;
}

.high {
  color: #e74c3c;
  font-weight: bold;
}

.low {
  color: #7f8c8d;
}
</style>