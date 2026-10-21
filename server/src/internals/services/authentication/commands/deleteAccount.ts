import type Repository from "../../../domain/user/repository.ts";

export default class DeleteAccount {
    accountRepository: Repository;

    constructor(
        accountRepository: Repository,
    ) {
        this.accountRepository = accountRepository;
    }


    handle = async (id: string): Promise<void> => {
                    await this.accountRepository.delete(id)
    };
}

