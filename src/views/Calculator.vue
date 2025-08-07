<script setup lang="ts">
import { ref, defineComponent } from 'vue'
import { useRouter } from 'vue-router'

// 定义多词组件名称
defineComponent({
  name: 'CalculatorView'
})

const router = useRouter()

const goBack = () => {
  router.push('/')
}

const display = ref('0')
const previousValue = ref<number | null>(null)
const currentOperation = ref<string | null>(null)
const waitingForOperand = ref(true)

const inputDigit = (digit: string) => {
  if (waitingForOperand.value) {
    display.value = digit
    waitingForOperand.value = false
  } else {
    display.value = display.value === '0' ? digit : display.value + digit
  }
}

const inputDecimal = () => {
  if (waitingForOperand.value) {
    display.value = '0.'
    waitingForOperand.value = false
    return
  }

  if (!display.value.includes('.')) {
    display.value += '.'
  }
}

const clearAll = () => {
  display.value = '0'
  previousValue.value = null
  currentOperation.value = null
  waitingForOperand.value = true
}

const handleOperation = (operation: string) => {
  const inputValue = parseFloat(display.value)

  if (previousValue.value === null) {
    previousValue.value = inputValue
  } else if (currentOperation.value) {
    const result = performCalculation(previousValue.value, inputValue, currentOperation.value)
    display.value = String(result)
    previousValue.value = result
  }

  waitingForOperand.value = true
  currentOperation.value = operation
}

const performCalculation = (firstOperand: number, secondOperand: number, operation: string): number => {
  switch (operation) {
    case '+':
      return firstOperand + secondOperand
    case '-':
      return firstOperand - secondOperand
    case '*':
      return firstOperand * secondOperand
    case '/':
      return firstOperand / secondOperand
    default:
      return secondOperand
  }
}

const calculateResult = () => {
  if (!currentOperation.value || previousValue.value === null) {
    return
  }

  const inputValue = parseFloat(display.value)
  const result = performCalculation(previousValue.value, inputValue, currentOperation.value)
  display.value = String(result)
  previousValue.value = null
  currentOperation.value = null
  waitingForOperand.value = true
}

const toggleSign = () => {
  const value = parseFloat(display.value)
  display.value = String(-value)
}

const calculatePercentage = () => {
  const value = parseFloat(display.value)
  display.value = String(value / 100)
}
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <button class="back-button" @click="goBack">返回</button>
      <h1>计算器</h1>
    </header>
    
    <main class="calculator-content">
      <div class="calculator">
        <div class="display">{{ display }}</div>
        
        <div class="buttons">
          <button class="button function" @click="clearAll">AC</button>
          <button class="button function" @click="toggleSign">+/-</button>
          <button class="button function" @click="calculatePercentage">%</button>
          <button class="button operation" @click="handleOperation('/')">÷</button>
          
          <button class="button digit" @click="inputDigit('7')">7</button>
          <button class="button digit" @click="inputDigit('8')">8</button>
          <button class="button digit" @click="inputDigit('9')">9</button>
          <button class="button operation" @click="handleOperation('*')">×</button>
          
          <button class="button digit" @click="inputDigit('4')">4</button>
          <button class="button digit" @click="inputDigit('5')">5</button>
          <button class="button digit" @click="inputDigit('6')">6</button>
          <button class="button operation" @click="handleOperation('-')">-</button>
          
          <button class="button digit" @click="inputDigit('1')">1</button>
          <button class="button digit" @click="inputDigit('2')">2</button>
          <button class="button digit" @click="inputDigit('3')">3</button>
          <button class="button operation" @click="handleOperation('+')">+</button>
          
          <button class="button digit zero" @click="inputDigit('0')">0</button>
          <button class="button digit" @click="inputDecimal">.</button>
          <button class="button equals" @click="calculateResult">=</button>
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

.calculator-content {
  display: flex;
  justify-content: center;
}

.calculator {
  width: 320px;
  background-color: #222;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
}

.display {
  background-color: #333;
  color: white;
  text-align: right;
  padding: 2rem 1rem;
  font-size: 2.5rem;
  font-family: 'Courier New', monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buttons {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background-color: #444;
}

.button {
  border: none;
  font-size: 1.5rem;
  padding: 1.5rem 0;
  cursor: pointer;
  transition: background-color 0.2s;
}

.digit {
  background-color: #555;
  color: white;
}

.digit:hover {
  background-color: #666;
}

.function {
  background-color: #aaa;
  color: #222;
}

.function:hover {
  background-color: #bbb;
}

.operation {
  background-color: #f39c12;
  color: white;
}

.operation:hover {
  background-color: #e67e22;
}

.equals {
  background-color: #e74c3c;
  color: white;
}

.equals:hover {
  background-color: #c0392b;
}

.zero {
  grid-column: span 2;
}
</style>