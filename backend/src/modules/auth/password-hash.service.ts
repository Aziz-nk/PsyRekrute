import { BadRequestException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Parametres Argon2id valides par le coordinateur (DCTF v3.1.2 §8.1 / D7) :
 * - Algorithme : Argon2id
 * - Memoire : 64 MiB (65536 KiB)
 * - Iterations (timeCost) : 3
 * - Parallelisme : 4
 */
export const ARGON2ID_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

@Injectable()
export class PasswordHashService {
  /**
   * Valide la longueur du mot de passe (12 a 128 caracteres, sans trim ni regle
   * artificielle de complexite afin d'autoriser les phrases de passe).
   */
  validatePasswordPolicy(password: unknown): asserts password is string {
    if (typeof password !== 'string') {
      throw new BadRequestException('Password must be a string');
    }
    if (
      password.length < PASSWORD_MIN_LENGTH ||
      password.length > PASSWORD_MAX_LENGTH
    ) {
      throw new BadRequestException(
        `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters`,
      );
    }
  }

  /** Hache un mot de passe avec Argon2id apres verification de la politique D7. */
  async hash(password: string): Promise<string> {
    this.validatePasswordPolicy(password);
    return argon2.hash(password, ARGON2ID_OPTIONS);
  }

  /** Verifie un mot de passe en clair contre une empreinte Argon2id. */
  async verify(passwordHash: string, plainPassword: string): Promise<boolean> {
    if (
      typeof passwordHash !== 'string' ||
      !passwordHash.startsWith('$argon2id$') ||
      typeof plainPassword !== 'string' ||
      plainPassword.length === 0 ||
      plainPassword.length > PASSWORD_MAX_LENGTH
    ) {
      return false;
    }
    try {
      return await argon2.verify(passwordHash, plainPassword);
    } catch {
      return false;
    }
  }
}
