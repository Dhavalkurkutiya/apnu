import React from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from 'heroui-native';
import { StatusBar } from 'expo-status-bar';

const RAUSCH_RED = '#ff385c';

export default function OnboardingScreen() {
  const router = useRouter();

  const rules = [
    {
      title: "Be yourself.",
      description: "Make sure your photos, age, and bio are true to who you are."
    },
    {
      title: "Stay safe.",
      description: "Don't be too quick to give out personal information. Date Safely."
    },
    {
      title: "Play it cool.",
      description: "Respect others and treat them as you would like to be treated."
    },
    {
      title: "Be proactive.",
      description: "Always report bad behavior."
    }
  ];

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Logo and Welcome */}
        <View style={styles.logoContainer}>
           <Ionicons name="flame" size={50} color={RAUSCH_RED} />
        </View>

        <View>
          <Text style={styles.title}>Welcome to Apnu.</Text>
          <Text style={styles.subtitle}>Please follow these House Rules.</Text>
        </View>

        {/* Rules List */}
        <View style={styles.rulesContainer}>
          {rules.map((rule, index) => (
            <View key={index} style={styles.ruleItem}>
              <Text style={styles.ruleTitle}>{rule.title}</Text>
              <Text style={styles.ruleDescription}>{rule.description}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Fixed Footer Button */}
      <View style={styles.footer}>
        <Button 
          onPress={() => router.replace("/")} 
          className="bg-black h-14 rounded-full w-full"
        >
          <Button.Label className="text-white font-bold text-lg">I agree</Button.Label>
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    paddingHorizontal: 30,
    paddingTop: 80,
    paddingBottom: 100,
  },
  logoContainer: {
    marginBottom: 20,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#222',
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
    marginBottom: 30,
    fontWeight: '500',
  },
  rulesContainer: {
    gap: 24,
  },
  ruleItem: {
    gap: 4,
  },
  ruleTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#222',
  },
  ruleDescription: {
    fontSize: 15,
    color: '#444',
    lineHeight: 22,
  },
  footer: {
    paddingHorizontal: 30,
    paddingBottom: 40,
    paddingTop: 10,
    backgroundColor: '#ffffff',
  }
});
