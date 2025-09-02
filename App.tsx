import 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { Platform, View, Text } from 'react-native';
import React from 'react';

// Import delle schermate
import LoginScreen from './LoginScreen';
import SignupScreen from './SignupScreen';
import BookingScreen from './BookingScreen';
import PrenotazioniScreen from './PrenotazioniScreen';
import ProfiloScreen from './ProfiloScreen';

// Import del contesto di autenticazione
import { AuthProvider, useAuth } from './context/AuthContext';

// Crea i navigator
const Tab = createMaterialTopTabNavigator();
const Stack = createStackNavigator();

// Componente personalizzato per le tab
const CustomTabBar = ({ state, descriptors, navigation, position }) => {
  return (
    <View style={{
      flexDirection: 'row',
      backgroundColor: 'white',
      borderBottomWidth: 1,
      borderBottomColor: '#e2e8f0',
      paddingTop: Platform.OS === 'ios' ? 60 : 50,
      height: Platform.OS === 'ios' ? 100 : 90,
    }}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const label = options.tabBarLabel !== undefined
          ? options.tabBarLabel
          : options.title !== undefined
          ? options.title
          : route.name;

        const isFocused = state.index === index;
        const color = isFocused ? '#3b82f6' : 'gray';

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <View key={index} style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 8,
          }}>
            <Ionicons
              name={options.tabBarIcon({ focused: isFocused, color }).props.name}
              size={24}
              color={color}
              onPress={onPress}
            />
            <Text style={{
              color,
              fontSize: 12,
              fontWeight: 'bold',
              marginTop: 4,
            }}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
};

// Componente per le tab principali dell'app
function MainTabs() {
  const { logout } = useAuth();

  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color }) => {
          let iconName;

          if (route.name === 'Prenota') {
            iconName = focused ? 'tennisball' : 'tennisball-outline';
          } else if (route.name === 'Prenotazioni') {
            iconName = focused ? 'list' : 'list-outline';
          } else if (route.name === 'Profilo') {
            iconName = focused ? 'person' : 'person-outline';
          } else if (route.name === 'Logout') {
            iconName = focused ? 'log-out' : 'log-out-outline';
          }

          return <Ionicons name={iconName} size={24} color={color} />;
        },
        tabBarActiveTintColor: '#3b82f6',
        tabBarInactiveTintColor: 'gray',
      })}
    >
      <Tab.Screen 
        name="Prenota" 
        component={BookingScreen}
        options={{
          title: 'Prenota',
        }}
      />
      <Tab.Screen 
        name="Prenotazioni" 
        component={PrenotazioniScreen}
        options={{
          title: 'Prenotazioni',
        }}
      />
      <Tab.Screen 
        name="Profilo" 
        component={ProfiloScreen}
        options={{
          title: 'Profilo',
        }}
      />
      <Tab.Screen 
        name="Logout" 
        children={() => null}
        options={{
          title: 'Logout',
        }}
        listeners={{
          tabPress: e => {
            e.preventDefault();
            logout();
          },
        }}
      />
    </Tab.Navigator>
  );
}

// Componente principale dell'app che gestisce la navigazione
function AppNavigator() {
  const { user } = useAuth();

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        // Utente autenticato - mostra le tab principali
        <Stack.Screen name="MainTabs" component={MainTabs} />
      ) : (
        // Utente non autenticato - mostra stack di autenticazione
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Signup" component={SignupScreen} />
        </>
      )}
      {/* Aggiungi lo screen Profilo come schermata separata nello stack */}
      <Stack.Screen 
        name="Profilo" 
        component={ProfiloScreen}
      />
    </Stack.Navigator>
  );
}

// Componente radice che avvolge tutto con l'AuthProvider
export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <StatusBar style="auto" />
        <AppNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}