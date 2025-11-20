import { View, Text, StyleSheet } from 'react-native';

export default function AuthCallbackScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Completing sign in...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111827',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 16,
  },
});
