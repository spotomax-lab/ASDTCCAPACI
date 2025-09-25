import { View, Text } from 'react-native';
import { Link } from 'expo-router';

export default function Home() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Welcome to ASD TC Capaci</Text>
      <Link href="/login">Go to Login</Link>
      <Link href="/signup">Go to Sign Up</Link>
    </View>
  );
}