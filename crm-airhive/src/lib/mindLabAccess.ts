type MindLabIdentity = {
    email?: string | null
    username?: string | null
    fullName?: string | null
}

const normalizeIdentity = (value: string | null | undefined) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

export const canAccessMindLab = ({ email, username, fullName }: MindLabIdentity) => {
    void email
    void username
    return normalizeIdentity(fullName) === 'jesus gracia'
}
