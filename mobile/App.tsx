import 'react-native-gesture-handler'
import React from 'react'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider } from './src/context/AuthContext'
import { LangProvider } from './src/context/LangContext'
import Navigation from './src/navigation'

export default function App() {
  return (
    <LangProvider>
      <AuthProvider>
        <StatusBar style='light' />
        <Navigation />
      </AuthProvider>
    </LangProvider>
  )
}