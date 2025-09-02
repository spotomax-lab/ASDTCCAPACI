import 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Platform, View, Text } from 'react-native';
import React, { useState, useEffect } from 'react';

// Import delle schermate
import LoginScreen from './LoginScreen';
import BookingScreen from './BookingScreen';
import PrenotazioniScreen from './PrenotazioniScreen';
import ProfiloScreen from './ProfiloScreen';

// Crea un navigator di tipo Top Tab
const Tab = createMaterialTopTabNavigator();

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

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Verifica allo startup se l'utente è già loggato
  useEffect(() => {
    // Qui potresti verificare se esiste un token di autenticazione salvato
    // Per ora simuliamo che l'utente non sia loggato all'avvio
    setIsLoggedIn(false);
  }, []);

  // Funzione di login
  const handleLogin = () => {
    setIsLoggedIn(true);
  };

  // Funzione di logout
  const handleLogout = () => {
    setIsLoggedIn(false);
  };

  // Se non è loggato, mostra la schermata di login
  if (!isLoggedIn) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  // Altrimenti mostra l'app con le tab
  return (
    <NavigationContainer>
      <StatusBar style="auto" />
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
          children={() => null} // Non renderizza nulla
          options={{
            title: 'Logout',
          }}
          listeners={{
            tabPress: e => {
              e.preventDefault(); // Previene la navigazione
              handleLogout(); // Esegue il logout
            },
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}