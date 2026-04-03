import { useState } from 'react';
import { useContacts, useAddContact, useDeleteContact, useUpdateContact } from '@/hooks/useStackData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Plus, Trash2, User, Mail, Phone, Pencil, Save, X } from 'lucide-react';

interface ContactsSectionProps {
  userApplicationId: string;
  isAdmin: boolean;
}

export default function ContactsSection({ userApplicationId, isAdmin }: ContactsSectionProps) {
  const { data: contacts = [] } = useContacts(userApplicationId);
  const addContact = useAddContact();
  const deleteContact = useDeleteContact();
  const updateContact = useUpdateContact();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ name: '', email: '', phone: '', role: '', support_url: '' });
  const [newContact, setNewContact] = useState({ name: '', email: '', phone: '', role: '', support_url: '' });

  const handleAdd = async () => {
    if (!newContact.name.trim()) return;
    try {
      await addContact.mutateAsync({
        user_application_id: userApplicationId,
        name: newContact.name,
        email: newContact.email || undefined,
        phone: newContact.phone || undefined,
        role: newContact.role || undefined,
        support_url: newContact.support_url || undefined,
      });
      setNewContact({ name: '', email: '', phone: '', role: '', support_url: '' });
      setShowAdd(false);
      toast({ title: 'Contact added' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleEdit = (c: any) => {
    setEditingId(c.id);
    setEditData({ name: c.name, email: c.email || '', phone: c.phone || '', role: c.role || '', support_url: c.support_url || '' });
  };

  const handleSaveEdit = async (id: string) => {
    try {
      await updateContact.mutateAsync({
        id,
        userApplicationId,
        name: editData.name,
        email: editData.email || null,
        phone: editData.phone || null,
        role: editData.role || null,
        support_url: editData.support_url || null,
      });
      setEditingId(null);
      toast({ title: 'Contact updated' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteContact.mutateAsync({ id, userApplicationId });
      toast({ title: 'Contact removed' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Contacts</p>
        {isAdmin && (
          <Button size="sm" variant="outline" onClick={() => setShowAdd(!showAdd)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
        )}
      </div>

      {contacts.map(c => (
        <div key={c.id} className="rounded-lg border p-3">
          {editingId === c.id ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Name *</Label>
                  <Input className="h-8 text-xs" value={editData.name} onChange={e => setEditData({ ...editData, name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Role</Label>
                  <Input className="h-8 text-xs" value={editData.role} onChange={e => setEditData({ ...editData, role: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Email</Label>
                  <Input className="h-8 text-xs" type="email" value={editData.email} onChange={e => setEditData({ ...editData, email: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Phone</Label>
                  <Input className="h-8 text-xs" value={editData.phone} onChange={e => setEditData({ ...editData, phone: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Support URL</Label>
                <Input className="h-8 text-xs" value={editData.support_url} onChange={e => setEditData({ ...editData, support_url: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleSaveEdit(c.id)} disabled={!editData.name.trim()}>
                  <Save className="h-3.5 w-3.5 mr-1" />Save
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                  <X className="h-3.5 w-3.5 mr-1" />Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium">{c.name}</span>
                  {c.role && <span className="text-xs text-muted-foreground">({c.role})</span>}
                </div>
                {c.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-3 w-3 text-muted-foreground" />
                    <a href={`mailto:${c.email}`} className="text-xs text-primary hover:underline">{c.email}</a>
                  </div>
                )}
                {c.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{c.phone}</span>
                  </div>
                )}
              </div>
              {isAdmin && (
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEdit(c)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(c.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {contacts.length === 0 && !showAdd && (
        <p className="text-xs text-muted-foreground">No contacts added yet.</p>
      )}

      {showAdd && (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Name *</Label>
              <Input className="h-8 text-xs" value={newContact.name} onChange={e => setNewContact({ ...newContact, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Role</Label>
              <Input className="h-8 text-xs" placeholder="e.g. Account Manager" value={newContact.role} onChange={e => setNewContact({ ...newContact, role: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input className="h-8 text-xs" type="email" value={newContact.email} onChange={e => setNewContact({ ...newContact, email: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phone</Label>
              <Input className="h-8 text-xs" value={newContact.phone} onChange={e => setNewContact({ ...newContact, phone: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Support URL</Label>
            <Input className="h-8 text-xs" value={newContact.support_url} onChange={e => setNewContact({ ...newContact, support_url: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={!newContact.name.trim()}>Save Contact</Button>
            <Button size="sm" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
