<script setup lang="ts">
import { ref, defineComponent, computed } from 'vue'
import { useRouter } from 'vue-router'

// 定义多词组件名称
defineComponent({
  name: 'GalleryView'
})

interface Photo {
  id: number
  title: string
  description: string
  url: string
  date: Date
  tags: string[]
}

const router = useRouter()

const goBack = () => {
  router.push('/')
}

const photos = ref<Photo[]>([
  {
    id: 1,
    title: '山间日出',
    description: '清晨在山顶拍摄的日出景色，云海环绕。',
    url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1274&q=80',
    date: new Date('2023-05-15'),
    tags: ['自然', '日出', '山脉']
  },
  {
    id: 2,
    title: '城市夜景',
    description: '繁华都市的夜晚，灯火通明。',
    url: 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1064&q=80',
    date: new Date('2023-06-22'),
    tags: ['城市', '夜景', '建筑']
  },
  {
    id: 3,
    title: '海滩日落',
    description: '金色的阳光洒在海面上，美丽的日落景色。',
    url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1173&q=80',
    date: new Date('2023-07-08'),
    tags: ['海滩', '日落', '海洋']
  },
  {
    id: 4,
    title: '森林小径',
    description: '穿过茂密森林的一条小径，阳光透过树叶洒落。',
    url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1171&q=80',
    date: new Date('2023-08-14'),
    tags: ['森林', '自然', '小径']
  },
  {
    id: 5,
    title: '雪山风光',
    description: '壮观的雪山景色，白雪皑皑。',
    url: 'https://images.unsplash.com/photo-1454496522488-7a8e488e8606?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1176&q=80',
    date: new Date('2023-09-05'),
    tags: ['雪山', '冬季', '自然']
  },
  {
    id: 6,
    title: '湖泊倒影',
    description: '平静的湖面倒映着周围的山脉和天空。',
    url: 'https://images.unsplash.com/photo-1439853949127-fa647821eba0?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=687&q=80',
    date: new Date('2023-10-20'),
    tags: ['湖泊', '倒影', '自然']
  }
])

const selectedPhotoId = ref<number | null>(null)
const searchQuery = ref('')
const selectedTag = ref<string | null>(null)

const openPhoto = (id: number) => {
  selectedPhotoId.value = id
}

const closePhoto = () => {
  selectedPhotoId.value = null
}

const selectTag = (tag: string) => {
  if (selectedTag.value === tag) {
    selectedTag.value = null
  } else {
    selectedTag.value = tag
    searchQuery.value = ''
  }
}

const filteredPhotos = computed(() => {
  let result = photos.value
  
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(photo => 
      photo.title.toLowerCase().includes(query) || 
      photo.description.toLowerCase().includes(query) ||
      photo.tags.some(tag => tag.toLowerCase().includes(query))
    )
  }
  
  if (selectedTag.value) {
    result = result.filter(photo => 
      photo.tags.includes(selectedTag.value!)
    )
  }
  
  return result
})

const selectedPhoto = computed(() => {
  if (selectedPhotoId.value === null) return null
  return photos.value.find(photo => photo.id === selectedPhotoId.value) || null
})

const formatDate = (date: Date) => {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date)
}

const allTags = computed(() => {
  const tags = new Set<string>()
  photos.value.forEach(photo => {
    photo.tags.forEach(tag => tags.add(tag))
  })
  return Array.from(tags)
})
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <button class="back-button" @click="goBack">返回</button>
      <h1>相册</h1>
    </header>
    
    <main class="gallery-content">
      <div class="gallery-controls">
        <div class="search-box">
          <input 
            type="text" 
            v-model="searchQuery" 
            placeholder="搜索照片..."
          >
        </div>
        
        <div class="tags-filter">
          <span class="filter-label">标签筛选:</span>
          <div class="tags-list">
            <button 
              v-for="tag in allTags" 
              :key="tag"
              class="tag-button"
              :class="{ 'active': selectedTag === tag }"
              @click="selectTag(tag)"
            >
              {{ tag }}
            </button>
          </div>
        </div>
      </div>
      
      <div class="photo-grid">
        <div 
          v-for="photo in filteredPhotos" 
          :key="photo.id" 
          class="photo-card"
          @click="openPhoto(photo.id)"
        >
          <div class="photo-image">
            <img :src="photo.url" :alt="photo.title">
          </div>
          <div class="photo-info">
            <h3>{{ photo.title }}</h3>
            <p class="photo-date">{{ formatDate(photo.date) }}</p>
          </div>
        </div>
        
        <div v-if="filteredPhotos.length === 0" class="empty-state">
          没有找到匹配的照片
        </div>
      </div>
    </main>
    
    <!-- 照片详情弹窗 -->
    <div v-if="selectedPhoto" class="photo-modal" @click="closePhoto">
      <div class="modal-content" @click.stop>
        <button class="close-button" @click="closePhoto">×</button>
        
        <div class="modal-image">
          <img :src="selectedPhoto.url" :alt="selectedPhoto.title">
        </div>
        
        <div class="modal-details">
          <h2>{{ selectedPhoto.title }}</h2>
          <p class="modal-date">{{ formatDate(selectedPhoto.date) }}</p>
          <p class="modal-description">{{ selectedPhoto.description }}</p>
          
          <div class="modal-tags">
            <span 
              v-for="tag in selectedPhoto.tags" 
              :key="tag"
              class="modal-tag"
            >
              {{ tag }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-container {
  max-width: 1200px;
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

.gallery-controls {
  margin-bottom: 2rem;
}

.search-box {
  margin-bottom: 1rem;
}

.search-box input {
  width: 100%;
  padding: 0.8rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
}

.tags-filter {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.filter-label {
  font-weight: bold;
  color: #2c3e50;
  margin-right: 0.5rem;
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.tag-button {
  background-color: #f1f1f1;
  border: none;
  padding: 0.4rem 0.8rem;
  border-radius: 20px;
  cursor: pointer;
  font-size: 0.9rem;
  color: #2c3e50;
  transition: all 0.2s;
}

.tag-button:hover {
  background-color: #e0e0e0;
}

.tag-button.active {
  background-color: #3498db;
  color: white;
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
}

.photo-card {
  background-color: #fff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.photo-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
}

.photo-image {
  height: 200px;
  overflow: hidden;
}

.photo-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s;
}

.photo-card:hover .photo-image img {
  transform: scale(1.05);
}

.photo-info {
  padding: 1rem;
}

.photo-info h3 {
  margin: 0 0 0.5rem 0;
  color: #2c3e50;
}

.photo-date {
  margin: 0;
  font-size: 0.8rem;
  color: #95a5a6;
}

.empty-state {
  grid-column: 1 / -1;
  padding: 2rem;
  text-align: center;
  color: #7f8c8d;
  font-style: italic;
}

/* 照片详情弹窗 */
.photo-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background-color: #fff;
  border-radius: 8px;
  width: 90%;
  max-width: 1000px;
  max-height: 90vh;
  overflow: auto;
  position: relative;
  display: flex;
  flex-direction: column;
}

.close-button {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background-color: rgba(0, 0, 0, 0.5);
  color: white;
  border: none;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  z-index: 10;
}

.modal-image {
  width: 100%;
  height: 60vh;
  overflow: hidden;
}

.modal-image img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.modal-details {
  padding: 1.5rem;
}

.modal-details h2 {
  margin: 0 0 0.5rem 0;
  color: #2c3e50;
}

.modal-date {
  font-size: 0.9rem;
  color: #95a5a6;
  margin-bottom: 1rem;
}

.modal-description {
  margin-bottom: 1.5rem;
  line-height: 1.6;
  color: #34495e;
}

.modal-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.modal-tag {
  background-color: #f1f1f1;
  padding: 0.3rem 0.6rem;
  border-radius: 20px;
  font-size: 0.8rem;
  color: #2c3e50;
}
</style>