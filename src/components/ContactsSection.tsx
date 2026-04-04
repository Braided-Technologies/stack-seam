import { useState } from 'react';
import { useContacts, useAddContact, useDeleteContact, useUpdateContact } from '@/hooks/useStackData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Plus, Trash2, User, Mail, Phone, Pencil, Save, X } from 'lucide-react';

interface ContactsSectionProps {
  userApplicationId: string;
  isAdmin: boolean;
}

const COUNTRY_CODES = [
  { code: '+1', label: 'US/CA (+1)' },
  { code: '+44', label: 'UK (+44)' },
  { code: '+61', label: 'AU (+61)' },
  { code: '+49', label: 'DE (+49)' },
  { code: '+33', label: 'FR (+33)' },
  { code: '+91', label: 'IN (+91)' },
  { code: '+81', label: 'JP (+81)' },
  { code: '+86', label: 'CN (+86)' },
  { code: '+55', label: 'BR (+55)' },
  { code: '+52', label: 'MX (+52)' },
  { code: '+27', label: 'ZA (+27)' },
  { code: '+64', label: 'NZ (+64)' },
  { code: '+353', label: 'IE (+353)' },
  { code: '+31', label: 'NL (+31)' },
  { code: '+46', label: 'SE (+46)' },
  { code: '+47', label: 'NO (+47)' },
  { code: '+45', label: 'DK (+45)' },
  { code: '+358', label: 'FI (+358)' },
  { code: '+34', label: 'ES (+34)' },
  { code: '+39', label: 'IT (+39)' },
  { code: '+41', label: 'CH (+41)' },
  { code: '+48', label: 'PL (+48)' },
  { code: '+43', label: 'AT (+43)' },
  { code: '+32', label: 'BE (+32)' },
  { code: '+351', label: 'PT (+351)' },
  { code: '+7', label: 'RU (+7)' },
  { code: '+82', label: 'KR (+82)' },
  { code: '+65', label: 'SG (+65)' },
  { code: '+852', label: 'HK (+852)' },
  { code: '+971', label: 'UAE (+971)' },
  { code: '+972', label: 'IL (+972)' },
];

function isValidEmail(email: string): boolean {
  if (!email) return true; // optional
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parsePhone(phone: string): { countryCode: string; number: string } {
  if (!phone) return { countryCode: '+1', number: '' };
  // Try to extract country code
  for (const cc of COUNTRY_CODES) {
    if (phone.startsWith(cc.code)) {
      return { countryCode: cc.code, number: phone.slice(cc.code.length).replace(/\D/g, '') };
    }
  }
  // Default: strip non-digits
  return { countryCode: '+1', number: phone.replace(/\D/g, '') };
}

function formatPhoneDisplay(phone: string): string {
  const { countryCode, number } = parsePhone(phone);
  if (!number) return '';
  // Format US/CA numbers
  if (countryCode === '+1' && number.length === 10) {
    return `${countryCode} (${number.slice(0, 3)}) ${number.slice(3, 6)}-${number.slice(6)}`;
  }
  return `${countryCode} ${number}`;
}

function isValidPhone(countryCode: string, number: string): boolean {
  if (!number) return true; // optional
  const digits = number.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

interface PhoneInputProps {
  countryCode: string;
  phoneNumber: string;
  onCountryCodeChange: (code: string) => void;
  onPhoneChange: (num: string) => void;
  error?: boolean;
}

function PhoneInput({ countryCode, phoneNumber, onCountryCodeChange, onPhoneChange, error }: PhoneInputProps) {
  return (
    <div className="flex gap-1">
      <Select value={countryCode} onValueChange={onCountryCodeChange}>
        <SelectTrigger className={`h-8 text-xs w-[100px] shrink-0 ${error ? 'border-destructive' : ''}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {COUNTRY_CODES.map(cc => (
            <SelectItem key={cc.code} value={cc.code} className="text-xs">
              {cc.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        className={`h-8 text-xs flex-1 ${error ? 'border-destructive' : ''}`}
        placeholder="Phone number"
        value={phoneNumber}
        onChange={e => onPhoneChange(e.target.value.replace(/[^\d\s\-()]/g, ''))}
      />
    </div>
  );
}

export default function ContactsSection({ userApplicationId, isAdmin }: ContactsSectionProps) {
  const { data: contacts = [] } = useContacts(userApplicationId);
  const addContact = useAddContact();
  const deleteContact = useDeleteContact();
  const updateContact = useUpdateContact();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ name: '', email: '', phone: '', role: '', support_url: '', countryCode: '+1', phoneNumber: '' });
  const [newContact, setNewContact] = useState({ name: '', email: '', phone: '', role: '', support_url: '', countryCode: '+1', phoneNumber: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (data: typeof newContact, prefix = '') => {
    const errs: Record<string, string> = {};
    if (!data.name.trim()) errs[prefix + 'name'] = 'Name is required';
    if (data.email && !isValidEmail(data.email)) errs[prefix + 'email'] = 'Invalid email address';
    if (data.phoneNumber && !isValidPhone(data.countryCode, data.phoneNumber)) errs[prefix + 'phone'] = 'Invalid phone number';
    return errs;
  };

  const handleAdd = async () => {
    const errs = validate(newContact);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    const phone = newContact.phoneNumber ? `${newContact.countryCode}${newContact.phoneNumber.replace(/\D/g, '')}` : '';
    try {
      await addContact.mutateAsync({
        user_application_id: userApplicationId,
        name: newContact.name,
        email: newContact.email || undefined,
        phone: phone || undefined,
        role: newContact.role || undefined,
        support_url: newContact.support_url || undefined,
      });
      setNewContact({ name: '', email: '', phone: '', role: '', support_url: '', countryCode: '+1', phoneNumber: '' });
      setShowAdd(false);
      setErrors({});
      toast({ title: 'Contact added' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleEdit = (c: any) => {
    const parsed = parsePhone(c.phone || '');
    setEditingId(c.id);
    setEditData({
      name: c.name,
      email: c.email || '',
      phone: c.phone || '',
      role: c.role || '',
      support_url: c.support_url || '',
      countryCode: parsed.countryCode,
      phoneNumber: parsed.number,
    });
    setErrors({});
  };

  const handleSaveEdit = async (id: string) => {
    const errs = validate(editData, 'edit_');
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    const phone = editData.phoneNumber ? `${editData.countryCode}${editData.phoneNumber.replace(/\D/g, '')}` : '';
    try {
      await updateContact.mutateAsync({
        id,
        userApplicationId,
        name: editData.name,
        email: editData.email || null,
        phone: phone || null,
        role: editData.role || null,
        support_url: editData.support_url || null,
      });
      setEditingId(null);
      setErrors({});
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
                  <Input className={`h-8 text-xs ${errors.edit_name ? 'border-destructive' : ''}`} value={editData.name} onChange={e => setEditData({ ...editData, name: e.target.value })} />
                  {errors.edit_name && <p className="text-[10px] text-destructive">{errors.edit_name}</p>}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Role</Label>
                  <Input className="h-8 text-xs" value={editData.role} onChange={e => setEditData({ ...editData, role: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Email</Label>
                  <Input className={`h-8 text-xs ${errors.edit_email ? 'border-destructive' : ''}`} type="email" value={editData.email} onChange={e => setEditData({ ...editData, email: e.target.value })} />
                  {errors.edit_email && <p className="text-[10px] text-destructive">{errors.edit_email}</p>}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Phone</Label>
                  <PhoneInput
                    countryCode={editData.countryCode}
                    phoneNumber={editData.phoneNumber}
                    onCountryCodeChange={code => setEditData({ ...editData, countryCode: code })}
                    onPhoneChange={num => setEditData({ ...editData, phoneNumber: num })}
                    error={!!errors.edit_phone}
                  />
                  {errors.edit_phone && <p className="text-[10px] text-destructive">{errors.edit_phone}</p>}
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
                <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setErrors({}); }}>
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
                    <span className="text-xs text-muted-foreground">{formatPhoneDisplay(c.phone)}</span>
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
              <Input className={`h-8 text-xs ${errors.name ? 'border-destructive' : ''}`} value={newContact.name} onChange={e => setNewContact({ ...newContact, name: e.target.value })} />
              {errors.name && <p className="text-[10px] text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Role</Label>
              <Input className="h-8 text-xs" placeholder="e.g. Account Manager" value={newContact.role} onChange={e => setNewContact({ ...newContact, role: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input className={`h-8 text-xs ${errors.email ? 'border-destructive' : ''}`} type="email" placeholder="name@company.com" value={newContact.email} onChange={e => setNewContact({ ...newContact, email: e.target.value })} />
              {errors.email && <p className="text-[10px] text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phone</Label>
              <PhoneInput
                countryCode={newContact.countryCode}
                phoneNumber={newContact.phoneNumber}
                onCountryCodeChange={code => setNewContact({ ...newContact, countryCode: code })}
                onPhoneChange={num => setNewContact({ ...newContact, phoneNumber: num })}
                error={!!errors.phone}
              />
              {errors.phone && <p className="text-[10px] text-destructive">{errors.phone}</p>}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Support URL</Label>
            <Input className="h-8 text-xs" value={newContact.support_url} onChange={e => setNewContact({ ...newContact, support_url: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={!newContact.name.trim()}>Save Contact</Button>
            <Button size="sm" variant="outline" onClick={() => { setShowAdd(false); setErrors({}); }}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
