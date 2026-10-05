import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View, Image, TouchableOpacity, FlatList } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import BottomTabBar from '../components/BottomTabBar'; // Adjust the path if needed
import { EmptyState } from '../components/StateViews';
import { getMetrics } from '../src/api/metrics';
import { setDisplayName, toggleFavourite, useSettings } from '../src/settings/settings';

export default function Profile() {
  const router = useRouter();

  // Real saved recipes, from the same persisted store the hearts write to.
  // This list used to be four hardcoded stock photos with invented authors.
  const settings = useSettings();
  const favourites = settings.favourites;

  // The profile used to read "[Your Name]", "[Your description]", a
  // randomuser.me photograph and invented counts (13 videos, 14K followers).
  // Everything shown now is either entered by the user or counted from this
  // session — nothing is fabricated.
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(settings.displayName);

  const name = settings.displayName.trim().length > 0 ? settings.displayName : 'Dishcovery user';
  const initial = name.charAt(0).toUpperCase();

  const samples = getMetrics();
  const formatsUsed = new Set(samples.map((sample) => sample.format)).size;

  return (
    <View style={styles.container}>
      <FlatList
        data={favourites}
        keyExtractor={item => String(item.id)}
        numColumns={2}
        columnWrapperStyle={{ justifyContent: 'space-between' }}
        ListHeaderComponent={
          <>
            {/* Header Row */}
            <View style={styles.headerRow}>
              <Text style={styles.header}>My Profile</Text>
            </View>
            {/* Avatar and name */}
            <View style={styles.avatarRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarInitial}>{initial}</Text>
              </View>
            </View>
            {editingName ? (
              <View style={styles.nameEditRow}>
                <TextInput
                  style={styles.nameInput}
                  value={draftName}
                  onChangeText={setDraftName}
                  placeholder="Your name"
                  placeholderTextColor="#b0b0b0"
                  autoFocus
                  maxLength={40}
                  onSubmitEditing={() => {
                    setDisplayName(draftName);
                    setEditingName(false);
                  }}
                />
                <TouchableOpacity
                  onPress={() => {
                    setDisplayName(draftName);
                    setEditingName(false);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.nameSave}>Save</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => {
                  setDraftName(settings.displayName);
                  setEditingName(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="Edit your display name"
              >
                <Text style={styles.name}>
                  {name} <MaterialCommunityIcons name="pencil-outline" size={16} color="#8EC6D7" />
                </Text>
              </TouchableOpacity>
            )}
            {/* Divider */}
            <View style={styles.divider} />
            {/* Stats — all counted, none invented */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{favourites.length}</Text>
                <Text style={styles.statLabel}>Saved</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{samples.length}</Text>
                <Text style={styles.statLabel}>Requests</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>{formatsUsed}</Text>
                <Text style={styles.statLabel}>Formats</Text>
              </View>
              <TouchableOpacity
                style={styles.statItem}
                onPress={() => router.push('/metrics')}
                accessibilityRole="button"
              >
                <MaterialCommunityIcons name="chart-line" size={22} color="#20515a" />
                <Text style={styles.statLabel}>Metrics</Text>
              </TouchableOpacity>
            </View>
            {/* Divider */}
            <View style={styles.divider} />
            {/* My Favorites */}
            <View style={styles.favHeaderRow}>
              <Text style={styles.favHeader}>My Favorites</Text>
              <Text style={styles.favCount}>
                {favourites.length === 0 ? '' : `${favourites.length} saved`}
              </Text>
            </View>
          </>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.favCard}
            onPress={() => router.push({ pathname: '/recipe', params: { id: String(item.id) } })}
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.title}`}
          >
            {item.image === null ? (
              <View style={[styles.favImage, { backgroundColor: '#dfeaec' }]} />
            ) : (
              <Image source={{ uri: item.image }} style={styles.favImage} />
            )}
            <TouchableOpacity
              style={styles.favLike}
              onPress={() => toggleFavourite(item)}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${item.title} from saved`}
              hitSlop={8}
            >
              <MaterialCommunityIcons name="heart" size={18} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.favTitle} numberOfLines={2}>{item.title}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <EmptyState
            title="No saved recipes yet"
            detail="Tap the heart on any recipe to save it here."
          />
        }
        contentContainerStyle={{ paddingBottom: 90 }}
        showsVerticalScrollIndicator={false}
      />
      <BottomTabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 40,
    paddingHorizontal: 18,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  header: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#22313F',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 8,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#abe1e5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#20515a',
    fontSize: 34,
    fontWeight: '700',
  },
  name: {
    fontWeight: 'bold',
    fontSize: 18,
    color: '#22313F',
    marginBottom: 2,
  },
  nameEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  nameInput: {
    flex: 1,
    backgroundColor: '#f3f7f8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#1a2b3b',
    fontSize: 16,
  },
  nameSave: {
    color: '#20515a',
    fontWeight: '700',
    fontSize: 14,
  },
  divider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 10,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    marginTop: 8,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#22313F',
  },
  statLabel: {
    color: '#888',
    fontSize: 12,
  },
  favHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 8,
  },
  favHeader: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#22313F',
  },
  favCount: {
    color: '#8EC6D7',
    fontSize: 13,
    fontWeight: '600',
  },
  favCard: {
    backgroundColor: '#f9faf7',
    borderRadius: 14,
    padding: 10,
    marginBottom: 14,
    width: '48%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  favImage: {
    width: '100%',
    height: 90,
    borderRadius: 12,
    marginBottom: 8,
  },
  favLike: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#8EC6D7',
    borderRadius: 12,
    padding: 4,
    zIndex: 2,
  },
  favTitle: {
    fontWeight: 'bold',
    fontSize: 14,
    color: '#22313F',
    marginBottom: 2,
  },
  favAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  favAuthor: {
    color: '#8EC6D7',
    fontSize: 12,
    marginLeft: 4,
  },
}); 