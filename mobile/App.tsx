import 'react-native-gesture-handler'
import React from 'react'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { View } from 'react-native'
import { AuthProvider } from './src/context/AuthContext'
import { LangProvider } from './src/context/LangContext'
import Navigation from './src/navigation'
import OfflineBanner from './src/components/OfflineBanner'

export default function App() {
  return (
    <SafeAreaProvider>
      <LangProvider>
        <AuthProvider>
          <StatusBar style='light' />
          <View style={{ flex: 1 }}>
            <Navigation />
            <OfflineBanner />
          </View>
        </AuthProvider>
      </LangProvider>
    </SafeAreaProvider>
  )
}