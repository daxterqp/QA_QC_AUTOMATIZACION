'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@lib/supabase/client';
import type { PhoneContact } from '@/types';

const supabase = createClient();
const CONTACTS_KEY = (projectId: string) => ['contacts', projectId];

export function useContacts(projectId: string) {
  return useQuery<PhoneContact[]>({
    queryKey: CONTACTS_KEY(projectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('phone_contacts')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

interface ContactInput {
  name: string;
  phone: string;
  role: string | null;
}

export function useCreateContact(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ContactInput) => {
      const { data: existing } = await supabase
        .from('phone_contacts')
        .select('sort_order')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .single();
      const nextOrder = (existing?.sort_order ?? 0) + 1;
      const { data, error } = await supabase
        .from('phone_contacts')
        .insert({
          project_id: projectId,
          name: input.name.trim(),
          phone: input.phone.trim(),
          role: input.role?.trim() || null,
          sort_order: nextOrder,
          created_at: Date.now(),
          updated_at: Date.now(),
        })
        .select()
        .single();
      if (error) throw error;
      return data as PhoneContact;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTACTS_KEY(projectId) }),
  });
}

export function useUpdateContact(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string } & ContactInput) => {
      const { error } = await supabase
        .from('phone_contacts')
        .update({
          name: input.name.trim(),
          phone: input.phone.trim(),
          role: input.role?.trim() || null,
          updated_at: Date.now(),
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTACTS_KEY(projectId) }),
  });
}

export function useDeleteContact(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('phone_contacts')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CONTACTS_KEY(projectId) }),
  });
}
