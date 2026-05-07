// Post Reactions Service
// Handles reactions on posts (not to be confused with user profile likes)

import { supabase } from '../supabase';
import { PostReaction, ReactionType, ServiceResponse } from '../../types/dataModels';

export class PostReactionsService {
  /**
   * Add a reaction to a post
   */
  async addReaction(
    postId: string,
    userId: string,
    reactionType: ReactionType = 'nice'
  ): Promise<ServiceResponse<PostReaction>> {
    try {
      // First, check if user already reacted to this post
      const { data: existingReaction, error: checkError } = await supabase
        .from('post_reactions')
        .select('*')
        .eq('post_id', postId)
        .eq('user_id', userId)
        .maybeSingle();

      if (existingReaction) {
        // If same reaction type, remove it (toggle off)
        if (existingReaction.reaction_type === reactionType) {
          return await this.removeReaction(postId, userId);
        }
        // If different reaction type, update it
        const { data, error } = await supabase
          .from('post_reactions')
          .update({ reaction_type: reactionType })
          .eq('post_id', postId)
          .eq('user_id', userId)
          .select()
          .single();

        if (error) {
          return { success: false, error: error.message };
        }

        return { success: true, data: data as PostReaction };
      }

      // Add new reaction
      const { data, error } = await supabase
        .from('post_reactions')
        .insert({
          post_id: postId,
          user_id: userId,
          reaction_type: reactionType,
        })
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: data as PostReaction };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to add reaction' };
    }
  }

  /**
   * Remove a reaction from a post
   */
  async removeReaction(
    postId: string,
    userId: string
  ): Promise<ServiceResponse<PostReaction>> {
    try {
      const { error } = await supabase
        .from('post_reactions')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: undefined };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to remove reaction' };
    }
  }

  /**
   * Get all reactions for a post
   */
  async getPostReactions(postId: string): Promise<ServiceResponse<PostReaction[]>> {
    try {
      const { data, error } = await supabase
        .from('post_reactions')
        .select('*')
        .eq('post_id', postId);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: data as PostReaction[] };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to get reactions' };
    }
  }

  /**
   * Get user's reaction to a post (if any)
   */
  async getUserReaction(
    postId: string,
    userId: string
  ): Promise<ServiceResponse<PostReaction | null>> {
    try {
      const { data, error } = await supabase
        .from('post_reactions')
        .select('*')
        .eq('post_id', postId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: data as PostReaction | null };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to get user reaction' };
    }
  }

  /**
   * Get reaction count by type for a post
   */
  async getReactionCounts(
    postId: string
  ): Promise<ServiceResponse<Record<ReactionType, number>>> {
    try {
      const { data, error } = await supabase
        .from('post_reactions')
        .select('reaction_type')
        .eq('post_id', postId);

      if (error) {
        return { success: false, error: error.message };
      }

      const counts: Record<ReactionType, number> = {
        nice: 0,
        good_job: 0,
        helpful: 0,
        inspiring: 0,
      };

      data?.forEach((reaction: any) => {
        if (reaction.reaction_type in counts) {
          counts[reaction.reaction_type as ReactionType]++;
        }
      });

      return { success: true, data: counts };
    } catch (error: any) {
      return { success: false, error: error.message || 'Failed to get reaction counts' };
    }
  }

  /**
   * Subscribe to reactions for a post
   */
  subscribeToPostReactions(
    postId: string,
    callback: (reaction: PostReaction) => void
  ) {
    return supabase
      .channel(`post_reactions:${postId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'post_reactions',
          filter: `post_id=eq.${postId}`,
        },
        (payload) => {
          callback(payload.new as PostReaction);
        }
      )
      .subscribe();
  }
}











