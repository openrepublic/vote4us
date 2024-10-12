import { Session, SessionKit } from '@wharfkit/session';
import { TransactPluginResourceProvider } from '@wharfkit/transact-plugin-resource-provider';
import { WalletPluginAnchor } from '@wharfkit/wallet-plugin-anchor';
import { WalletPluginCleos } from '@wharfkit/wallet-plugin-cleos';
import WebRenderer from '@wharfkit/web-renderer';
import axios from 'axios';
import { BehaviorSubject } from 'rxjs';

// types -------------------
export interface LoggedAccount {
    name: string;
    permission: string;
    user: Session;
}

export interface Statics {
    rank: number;
    votes: number;
    totalVotes: number;
    percentage: string;
    list: string[];
}

export type BlockProducers = string[];
export interface Vote4UsConfig {
    appName?: string;
    currentProducer: string;
    suggestedBPs: string[];
    notSuggestedBPs: string[];
    rpcEndpoint: string;
    chainId: string;
    expectedBPs: number;
}

export interface Vote4UsState {
    originalBPSelection: BlockProducers;
    modifiedBPSelection: BlockProducers;
    roomForMoreBPs: number;
    logged: LoggedAccount | null;
    currentProducerStatics: Statics;
    showDialog: boolean;
    thanks: boolean;
    hasVotedForUs: boolean;
    addRecommendedBPs: boolean;
    error: string;
}
export const emptyStatics: Statics = { rank: 0, votes: 0, totalVotes: 0, percentage: '', list: [] };
// -----------------------------

export class Vote4Us {
    public config: Vote4UsConfig;
    public state: Vote4UsState = {
        originalBPSelection: [] as BlockProducers,
        modifiedBPSelection: [] as BlockProducers,
        roomForMoreBPs: 30,
        logged: null as LoggedAccount | null,
        currentProducerStatics: emptyStatics as Statics,
        showDialog: false,
        thanks: false,
        hasVotedForUs: true,
        addRecommendedBPs: true,
        error: '',
    };
    public change = new BehaviorSubject<Vote4UsState>(this.state);

    private ui: WebRenderer;
    private kit: SessionKit;

    // DOM elements
    private dialogElement: HTMLElement;
    private notLoggedInContent: HTMLElement;
    private errorContent: HTMLElement;
    private voteContent: HTMLElement;
    private alreadyVotedContent: HTMLElement;
    private thanksContent: HTMLElement;
    private addRecommendedBPsCheckbox: HTMLInputElement;

    constructor(config: Vote4UsConfig) {
        this.config = config;
    }

    init() {
        this.ui = new WebRenderer();

        this.kit = new SessionKit(
            {
                appName: this.config.appName || 'Vote4Us',
                chains: [
                    {
                        id: this.config.chainId,
                        url: this.config.rpcEndpoint,
                    },
                ],
                ui: this.ui,
                walletPlugins: [new WalletPluginAnchor(), new WalletPluginCleos()],
            },
            {
                transactPlugins: [new TransactPluginResourceProvider()],
            }
        );

        // Start fetching the statistics of the current producer
        this.startFetchingStatics();

        // Append the dialog elements to the DOM
        this.appendElements();

        // Update the dialog state according to the current state
        this.subscribeToStateChangesToUpdateUI();
    }

    // Subscribe to state changes to update the dialog UI
    subscribeToStateChangesToUpdateUI() {
        this.change.subscribe((state) => {
            console.log('Vote4Us state:', state);
            // Show or hide the main dialog
            if (state.showDialog) {
                // Show the dialog by removing the 'display: none' style and letting the CSS handle the rest
                this.dialogElement.style.display = '';
            } else {
                this.dialogElement.style.display = 'none';
            }

            // Hide all content sections initially
            this.notLoggedInContent.style.display = 'none';
            this.errorContent.style.display = 'none';
            this.voteContent.style.display = 'none';
            this.alreadyVotedContent.style.display = 'none';
            this.thanksContent.style.display = 'none';

            if (!state.logged) {
                // Not logged in
                this.notLoggedInContent.style.display = '';
            } else if (state.thanks) {
                // Show thanks content
                this.thanksContent.style.display = '';
            } else if (state.error !== '') {
                // Show error content
                const errorText = this.errorContent.querySelector('.vote4us-dialog__content-text') as HTMLElement;
                errorText.innerHTML = `<span style="color: red;">${state.error}</span>`;
                this.errorContent.style.display = '';
            } else if (!state.hasVotedForUs) {
                // User has not voted for us yet
                this.updateVoteContent(state);
                this.voteContent.style.display = '';
            } else if (state.hasVotedForUs) {
                // User has already voted for us
                const alreadyVotedText = this.alreadyVotedContent.querySelector('.vote4us-dialog__content-text') as HTMLElement;
                alreadyVotedText.innerHTML = `<b>${state.logged?.name}</b><br><br>You have already voted for us.<br>Thank you for your support!!!`;
                this.alreadyVotedContent.style.display = '';
            }
        });
    }

    appendElements() {
        // Append the dialog element to the DOM
        this.appendDialogElement();

        // Append the dialog style element to the DOM
        this.appendDialogStyleElement();

        // Append the wharfkit dialog element
        this.ui.appendDialogElement();
    }

    appendDialogElement() {
        // check if the dialog element already exists. If exists, remove it
        const dialogElement = document.querySelector('.vote4us-dialog');
        if (dialogElement) {
            dialogElement.remove();
        }

        // Create the main dialog container
        this.dialogElement = document.createElement('div');
        this.dialogElement.className = 'vote4us-dialog';
        this.dialogElement.style.display = 'none'; // Initially hidden

        // Create content container
        const contentContainer = document.createElement('div');
        contentContainer.className = 'vote4us-dialog__content';
        this.dialogElement.appendChild(contentContainer);

        // Not logged in content
        this.notLoggedInContent = document.createElement('div');
        this.notLoggedInContent.className = 'vote4us-dialog__content-inner';
        this.notLoggedInContent.style.display = 'none';

        const notLoggedInText = document.createElement('p');
        notLoggedInText.className = 'vote4us-dialog__content-text';
        notLoggedInText.innerHTML = 'Please login with your Telos account<br>to vote for us';
        this.notLoggedInContent.appendChild(notLoggedInText);

        const loginButton = document.createElement('button');
        loginButton.className = 'vote4us-dialog__content-button';
        loginButton.textContent = 'Login';
        loginButton.addEventListener('click', () => this.openLoginDialog());
        this.notLoggedInContent.appendChild(loginButton);

        contentContainer.appendChild(this.notLoggedInContent);

        // Error content
        this.errorContent = document.createElement('div');
        this.errorContent.className = 'vote4us-dialog__content-inner';
        this.errorContent.style.display = 'none';

        const errorText = document.createElement('p');
        errorText.className = 'vote4us-dialog__content-text';
        this.errorContent.appendChild(errorText);

        const closeErrorButton = document.createElement('button');
        closeErrorButton.className = 'vote4us-dialog__content-button';
        closeErrorButton.textContent = 'Close';
        closeErrorButton.addEventListener('click', () => this.closeDialog());
        this.errorContent.appendChild(closeErrorButton);

        contentContainer.appendChild(this.errorContent);

        // Vote content
        this.voteContent = document.createElement('div');
        this.voteContent.className = 'vote4us-dialog__content-inner';
        this.voteContent.style.display = 'none';
        contentContainer.appendChild(this.voteContent);

        // Already voted content
        this.alreadyVotedContent = document.createElement('div');
        this.alreadyVotedContent.className = 'vote4us-dialog__content-inner';
        this.alreadyVotedContent.style.display = 'none';

        const alreadyVotedText = document.createElement('p');
        alreadyVotedText.className = 'vote4us-dialog__content-text';
        this.alreadyVotedContent.appendChild(alreadyVotedText);

        const closeAlreadyVotedButton = document.createElement('button');
        closeAlreadyVotedButton.className = 'vote4us-dialog__content-button';
        closeAlreadyVotedButton.textContent = 'Close';
        closeAlreadyVotedButton.addEventListener('click', () => this.closeDialog());
        this.alreadyVotedContent.appendChild(closeAlreadyVotedButton);

        contentContainer.appendChild(this.alreadyVotedContent);

        // Thanks content
        this.thanksContent = document.createElement('div');
        this.thanksContent.className = 'vote4us-dialog__content-inner';
        this.thanksContent.style.display = 'none';

        const thanksText = document.createElement('p');
        thanksText.className = 'vote4us-dialog__content-text';
        thanksText.innerHTML = 'Thank you for your support!!!';
        this.thanksContent.appendChild(thanksText);

        const closeThanksButton = document.createElement('button');
        closeThanksButton.className = 'vote4us-dialog__content-button';
        closeThanksButton.textContent = 'Close';
        closeThanksButton.addEventListener('click', () => this.closeDialog());
        this.thanksContent.appendChild(closeThanksButton);

        this.thanksContent.appendChild(closeThanksButton);

        contentContainer.appendChild(this.thanksContent);

        // Append the dialog to the document body
        document.body.appendChild(this.dialogElement);
    }

    appendDialogStyleElement() {
        const styleElement = document.createElement('style');
        styleElement.textContent = `
            /* Definición de variables CSS */
            body {
                /* Variables para .vote4us__dialog */
                --vote4us-dialog-background: #00000080;
                --vote4us-dialog-z-index: 1000;

                /* Variables para .vote4us-dialog__content */
                --vote4us-dialog-content-background: #fff;
                --vote4us-dialog-content-border-radius: 10px;
                --vote4us-dialog-content-box-shadow: 7px 7px 7px 0 #00000080;
                --vote4us-dialog-content-max-width: 950px;
                --vote4us-dialog-content-padding: 40px;

                /* Variables para .vote4us-dialog__content-inner */
                --vote4us-dialog-content-inner-gap: 20px;

                /* Variables para .vote4us-dialog__content-text */
                --vote4us-dialog-content-text-font-size: 20px;
                --vote4us-dialog-content-text-margin: 0 0 16px;

                /* Variables para .vote4us-dialog__content-button */
                --vote4us-dialog-button-background-color: #3b6cac;
                --vote4us-dialog-button-border-radius: 10px;
                --vote4us-dialog-button-box-shadow: 2px 2px 2px 0 #00000080;
                --vote4us-dialog-button-color: #fff;
                --vote4us-dialog-button-font-size: 20px;
                --vote4us-dialog-button-padding: 10px 20px;

                /* Variables para el estado :hover del botón */
                --vote4us-dialog-button-hover-background-color: #5183c5;
                --vote4us-dialog-button-hover-box-shadow: 4px 4px 4px 0 #00000080;

                /* Variables para el estado :active del botón */
                --vote4us-dialog-button-active-background-color: #2e4f7f;
                --vote4us-dialog-button-active-box-shadow: 1px 1px 1px 0 #00000080;

                /* Variables para .vote4us-dialog__name-grid */
                --vote4us-dialog-name-grid-gap: 16px;
                --vote4us-dialog-name-grid-columns: repeat(5, 1fr);
                --vote4us-dialog-name-grid-margin: 16px;

                /* Variables para .vote4us-dialog__name-cell-button */
                --vote4us_dialog-name-cell-button-current-bg: #3b6cac;
                --vote4us_dialog-name-cell-button-current-txt: #fff;
                --vote4us_dialog-name-cell-button-suggested-bg: #4c9c67;
                --vote4us_dialog-name-cell-button-suggested-txt: #fff;
                --vote4us_dialog-name-cell-button-normal-bg: #8b3f98;
                --vote4us_dialog-name-cell-button-normal-txt: #fff;

                /* Variables para el estado :hover y :active de los botones anteriores */
                --vote4us_dialog-name-cell-button-current-bg-hover: #5183c5;
                --vote4us_dialog-name-cell-button-current-bg-active: #2e4f7f;
                --vote4us_dialog-name-cell-button-suggested-bg-hover: #6dbb8e;
                --vote4us_dialog-name-cell-button-suggested-bg-active: #4c9c67;
                --vote4us_dialog-name-cell-button-normal-bg-hover: #a05ebd;
                --vote4us_dialog-name-cell-button-normal-bg-active: #8b3f98;
            }

            /* low resolutions */
            @media (max-width: 800px) {
                body {
                    --vote4us-dialog-name-grid-columns: repeat(3, 1fr);
                    --vote4us-dialog-content-inner-gap: 10px;
                    --vote4us-dialog-content-text-font-size: 18px;
                    --vote4us-dialog-content-text-margin: 0 0 12px;                    
                }
            }

            @media (max-width: 600px) {
                body {
                    --vote4us-dialog-name-grid-columns: repeat(2, 1fr);
                    --vote4us-dialog-content-inner-gap: 5px;
                    --vote4us-dialog-content-text-font-size: 16px;
                    --vote4us-dialog-content-text-margin: 0 0 6px;                    
                }
            }

            /* Estilos actualizados utilizando variables CSS */
            .vote4us-dialog {
                align-items: center;
                background: var(--vote4us-dialog-background);
                display: flex;
                height: 100vh;
                justify-content: center;
                left: 0;
                position: fixed;
                top: 0;
                width: 100vw;
                z-index: var(--vote4us-dialog-z-index);
            }

            .vote4us-dialog__content {
                background: var(--vote4us-dialog-content-background);
                border-radius: var(--vote4us-dialog-content-border-radius);
                box-shadow: var(--vote4us-dialog-content-box-shadow);
                display: flex;
                flex-direction: column;
                max-width: var(--vote4us-dialog-content-max-width);
                padding: var(--vote4us-dialog-content-padding);
            }

            .vote4us-dialog__content-inner {
                display: flex;
                flex-direction: column;
                gap: var(--vote4us-dialog-content-inner-gap);
            }

            .vote4us-dialog__content-text {
                font-size: var(--vote4us-dialog-content-text-font-size);
                margin: var(--vote4us-dialog-content-text-margin);
                text-align: center;
            }

            .vote4us-dialog__content-button {
                background-color: var(--vote4us-dialog-button-background-color);
                border-radius: var(--vote4us-dialog-button-border-radius);
                border-width: 0;
                box-shadow: var(--vote4us-dialog-button-box-shadow);
                color: var(--vote4us-dialog-button-color);
                cursor: pointer;
                font-size: var(--vote4us-dialog-button-font-size);
                padding: var(--vote4us-dialog-button-padding);
            }

            .vote4us-dialog__content-button:hover {
                background-color: var(--vote4us-dialog-button-hover-background-color);
                box-shadow: var(--vote4us-dialog-button-hover-box-shadow);
            }

            .vote4us-dialog__content-button:active {
                background-color: var(--vote4us-dialog-button-active-background-color);
                box-shadow: var(--vote4us-dialog-button-active-box-shadow);
            }

            .vote4us-dialog__name-grid {
                display: grid;
                grid-gap: var(--vote4us-dialog-name-grid-gap);
                grid-template-columns: var(--vote4us-dialog-name-grid-columns);
                margin: var(--vote4us-dialog-name-grid-margin);
                max-height: 40vh;
                overflow: auto;
            }

            .vote4us-dialog__name-cell {
                align-items: center;
                display: flex;
                justify-content: center;
            }

            .vote4us-dialog__name-cell-button {
                align-items: stretch;
                border: 0;
                cursor: default;
                display: inline-flex;
                flex-direction: row;
                flex-grow: 1;
                justify-content: center;
                align-items: center;
                font-size: 14px;
                font-weight: 500;
                height: 100%;
                line-height: 1.715em;
                min-height: 2.572em;
                outline: 0;
                padding: 4px 16px;
                position: relative;
                text-align: center;
                text-decoration: none;
                width: 100%;
            }

            .vote4us-dialog__name-cell-button:before {
                transition: box-shadow .3s cubic-bezier(.25,.8,.5,1);
                content: '';
                border-radius: inherit;
                bottom: 0;
                box-shadow: 0 1px 5px #0003, 0 2px 2px #00000024, 0 3px 1px -2px #0000001f;
                content: "";
                display: block;
                left: 0;
                position: absolute;
                right: 0;
                top: 0;
            }

            .vote4us-dialog__name-cell-button.current {
                border-radius: var(--vote4us-dialog-button-border-radius);
                background-color: var(--vote4us_dialog-name-cell-button-current-bg);
                color: var(--vote4us_dialog-name-cell-button-current-txt);
            }

            .vote4us-dialog__name-cell-button.current:hover {
                background-color: var(--vote4us_dialog-name-cell-button-current-bg-hover);
                box-shadow: var(--vote4us-dialog-button-hover-box-shadow);
            }

            .vote4us-dialog__name-cell-button.current:active {
                background-color: var(--vote4us_dialog-name-cell-button-current-bg-active);
                box-shadow: var(--vote4us-dialog-button-active-box-shadow);
            }

            .vote4us-dialog__name-cell-button.suggested {
                border-radius: var(--vote4us-dialog-button-border-radius);
                background-color: var(--vote4us_dialog-name-cell-button-suggested-bg);
                color: var(--vote4us_dialog-name-cell-button-suggested-txt);
            }

            .vote4us-dialog__name-cell-button.suggested:hover {
                background-color: var(--vote4us_dialog-name-cell-button-suggested-bg-hover);
                box-shadow: var(--vote4us-dialog-button-hover-box-shadow);
            }

            .vote4us-dialog__name-cell-button.suggested:active {
                background-color: var(--vote4us_dialog-name-cell-button-suggested-bg-active);
                box-shadow: var(--vote4us-dialog-button-active-box-shadow);
            }

            .vote4us-dialog__name-cell-button.normal {
                border-radius: var(--vote4us-dialog-button-border-radius);
                background-color: var(--vote4us_dialog-name-cell-button-normal-bg);
                color: var(--vote4us_dialog-name-cell-button-normal-txt);
            }

            .vote4us-dialog__name-cell-button.normal:hover {
                background-color: var(--vote4us_dialog-name-cell-button-normal-bg-hover);
                box-shadow: var(--vote4us-dialog-button-hover-box-shadow);
            }

            .vote4us-dialog__name-cell-button.normal:active {
                background-color: var(--vote4us_dialog-name-cell-button-normal-bg-active);
                box-shadow: var(--vote4us-dialog-button-active-box-shadow);
            }

            .vote4us-dialog__name-cell-button-tooltip {
                opacity: 0;
                pointer-events: none;
                position: absolute;
                background-color: #757575;
                color: #ffffff;
                font-size: 12px;
                padding: 4px 8px;
                border-radius: 4px;
                margin-bottom: 50px;
                z-index: 1001;
                transition: opacity 0.3s, margin-bottom 0.3s;
            }

            .vote4us-dialog__name-cell:hover .vote4us-dialog__name-cell-button-tooltip {
                opacity: 1;
                margin-bottom: 80px;
            }
        `;
        document.head.appendChild(styleElement);
    }

    // Update the vote content based on the current state
    updateVoteContent(state: Vote4UsState) {

        // Clear previous content
        this.voteContent.innerHTML = '';

        // User is logged in as...
        const loggedInText = document.createElement('p');
        loggedInText.className = 'vote4us-dialog__content-text';
        loggedInText.innerHTML = `You are logged in as <b>${state.logged?.name}</b>.`;
        this.voteContent.appendChild(loggedInText);

        if (state.roomForMoreBPs === 0) {
            // No room for more BPs
            const noRoomText1 = document.createElement('p');
            noRoomText1.className = 'vote4us-dialog__content-text';
            noRoomText1.textContent =
                'You have already voted for 30 BPs and you have no room for more. But if you still want to vote for us, you can remove one of your current BPs.';
            this.voteContent.appendChild(noRoomText1);

            const noRoomText2 = document.createElement('p');
            noRoomText2.className = 'vote4us-dialog__content-text';
            noRoomText2.innerHTML = `Please, choose one of the following BPs to be replaced by <b>${this.config.currentProducer}</b>`;
            this.voteContent.appendChild(noRoomText2);

            // Grid of BP buttons
            const grid = document.createElement('div');
            grid.className = 'vote4us-dialog__name-grid';

            state.modifiedBPSelection.forEach((name, index) => {
                const cell = document.createElement('div');
                cell.className = 'vote4us-dialog__name-cell';

                if (name !== this.config.currentProducer) {
                    const btn = document.createElement('button');
                    btn.textContent = name;
                    btn.addEventListener('click', () => this.dropBP(name));
                    // If suggested BP
                    if (this.config.suggestedBPs.includes(name)) {
                        btn.className = 'vote4us-dialog__name-cell-button suggested';
                        // If it is suggested we need to display a tooltip saying that it is suggested BP when hovering
                        const tooltip = document.createElement('span');
                        tooltip.className = 'vote4us-dialog__name-cell-button-tooltip';
                        tooltip.textContent = 'We recommend to keep this BP';
                        cell.appendChild(tooltip);
                    } else {
                        btn.className = 'vote4us-dialog__name-cell-button normal';
                    }
                    cell.appendChild(btn);
                } else {
                    const btn = document.createElement('button');
                    btn.textContent = this.config.currentProducer;
                    btn.className = 'vote4us-dialog__name-cell-button current';
                    btn.addEventListener('click', () => this.resetModifiedBPSelection());
                    cell.appendChild(btn);
                }

                grid.appendChild(cell);
            });

            this.voteContent.appendChild(grid);

            if (state.modifiedBPSelection.includes(this.config.currentProducer)) {
                const voteButton = document.createElement('button');
                voteButton.className = 'vote4us-dialog__content-button';
                voteButton.innerHTML = `Ready to vote for <b>${this.config.currentProducer}</b>`;
                voteButton.addEventListener('click', () => this.voteForUs());
                this.voteContent.appendChild(voteButton);
            }
        } else if (state.roomForMoreBPs === 1) {
            // Room for one more BP
            const voteButton = document.createElement('button');
            voteButton.className = 'vote4us-dialog__content-button';
            voteButton.innerHTML = `Vote for <b>${this.config.currentProducer}</b>`;
            voteButton.addEventListener('click', () => this.voteForUs());
            this.voteContent.appendChild(voteButton);
        } else if (state.roomForMoreBPs > 1) {
            // Room for more than one BP
            const moreRoomText1 = document.createElement('p');
            moreRoomText1.className = 'vote4us-dialog__content-text';
            moreRoomText1.innerHTML = `We notice that you have voted only for ${
                30 - state.roomForMoreBPs
            } BPs and you have room for ${state.roomForMoreBPs} more, which will power up your vote!`;
            this.voteContent.appendChild(moreRoomText1);

            const moreRoomText2 = document.createElement('p');
            moreRoomText2.className = 'vote4us-dialog__content-text';
            moreRoomText2.textContent = 'Would you like to complete your vote with recommended BPs?';
            this.voteContent.appendChild(moreRoomText2);

            // Checkbox for addRecommendedBPs
            const checkboxContainer = document.createElement('p');
            checkboxContainer.className = 'vote4us-dialog__content-text';

            const checkboxLabel = document.createElement('label');
            checkboxLabel.textContent = ' Yes, complete my vote';

            this.addRecommendedBPsCheckbox = document.createElement('input');
            this.addRecommendedBPsCheckbox.type = 'checkbox';
            this.addRecommendedBPsCheckbox.checked = state.addRecommendedBPs;
            this.addRecommendedBPsCheckbox.addEventListener('change', () => {
                this.state.addRecommendedBPs = this.addRecommendedBPsCheckbox.checked;
                this.change.next(this.state);
            });

            checkboxLabel.insertBefore(this.addRecommendedBPsCheckbox, checkboxLabel.firstChild);
            checkboxContainer.appendChild(checkboxLabel);
            this.voteContent.appendChild(checkboxContainer);

            const voteButton = document.createElement('button');
            voteButton.className = 'vote4us-dialog__content-button';
            voteButton.innerHTML = `Vote for <b>${this.config.currentProducer}</b>`;
            voteButton.addEventListener('click', () => this.voteForUs());
            this.voteContent.appendChild(voteButton);
        }
    }

    // Reset all internal states of the class
    resetAll() {
        // Logout user from SessionKit
        this.kit.logout();

        // Reset state
        this.state = {
            originalBPSelection: [],
            modifiedBPSelection: [],
            roomForMoreBPs: 30,
            logged: null,
            currentProducerStatics: this.state.currentProducerStatics,
            showDialog: false,
            thanks: false,
            hasVotedForUs: true,
            addRecommendedBPs: true,
            error: '',
        };
        this.change.next(this.state);
    }

    // Fetch the list of block producers
    async getProducers() {
        const params = {
            json: true,
            code: 'eosio',
            scope: 'eosio',
            table: 'producers',
            limit: 1000,
            reverse: false,
            show_payer: false,
        };

        let producers = [];
        let attempts = 0;
        const maxAttempts = 5;

        while (attempts < maxAttempts) {
            try {
                const response = await axios.post(this.config.rpcEndpoint + '/v1/chain/get_table_rows', params);
                producers = response.data.rows;
                if (producers.length >= this.config.expectedBPs) {
                    break;
                }
            } catch (error) {
                console.error('Error fetching producers data:', error);
            }
            attempts++;
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        const activeProducers = producers.filter((producer) => producer.is_active === 1);
        activeProducers.sort((a, b) => parseFloat(b.total_votes) - parseFloat(a.total_votes));

        return activeProducers;
    }

    // Start fetching the statistics of the current producer
    async startFetchingStatics() {
        this.state.currentProducerStatics = emptyStatics;
        this.change.next(this.state);
        const producers = await this.getProducers();

        if (producers.length === 0) {
            return { rank: 0, votes: 0, totalVotes: 0, percentage: '', list: [] };
        }

        const totalVotes = Math.round(producers.reduce((sum, producer) => sum + parseFloat(producer.total_votes), 0));

        const producerData = producers.find((producer) => producer.owner === this.config.currentProducer);
        if (!producerData) {
            console.error(`${this.config.currentProducer} not found among producers.`);
            return { rank: 0, votes: 0, totalVotes: 0, percentage: '', list: [] };
        }

        const rank = producers.findIndex((producer) => producer.owner === this.config.currentProducer) + 1;
        const percentageOfVotes = (parseFloat(producerData.total_votes) / totalVotes) * 100;
        const votes = Math.round(parseFloat(producerData.total_votes) / 10000);
        const percentage = percentageOfVotes.toFixed(2) + '%';
        const list = producers.map((producer) => producer.owner);

        const statics: Statics = { rank, votes, totalVotes, percentage, list };
        this.state.currentProducerStatics = statics;
        this.change.next(this.state);
        return statics;
    }

    // Get the list of block producers voted by the user
    async getVotedProducers(accountName: string): Promise<string[]> {
        try {
            const response = await fetch(`${this.config.rpcEndpoint}/v1/chain/get_account`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    account_name: accountName,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to fetch account info');
            }

            const accountInfo = await response.json();

            if (accountInfo.voter_info && accountInfo.voter_info.producers) {
                let producers = accountInfo.voter_info.producers as string[];
                producers = producers.filter((producer) => this.state.currentProducerStatics.list.includes(producer));
                this.state.roomForMoreBPs = 30 - producers.length;
                this.state.hasVotedForUs = producers.includes(this.config.currentProducer);
                this.change.next(this.state);
                return producers;
            } else {
                return [];
            }
        } catch (error) {
            console.error('Error fetching voted producers:', error);
            return [];
        }
    }

    // Replace a block producer in the modified selection list
    dropBP(bp: string) {
        let producers = [...this.state.originalBPSelection] || [];
        const index = producers.indexOf(bp);
        producers[index] = this.config.currentProducer;
        this.state.modifiedBPSelection = producers;
        this.change.next(this.state);
    }

    // Show the voting dialog
    openDialog() {
        console.log('openDialog()');
        this.state.showDialog = true;
        this.change.next(this.state);
    }

    // Close the voting dialog and reset the state if needed
    closeDialog() {
        if (this.state.thanks || this.state.hasVotedForUs || this.state.error) {
            this.resetAll();
            
        } else {
            this.state.showDialog = false;
            this.change.next(this.state);
        }
    }

    // Update the list of block producers voted by the user
    async updateVotedProducers() {
        const producers = await this.getVotedProducers(this.state.logged?.name || '');
        this.state.originalBPSelection = producers;
        this.state.modifiedBPSelection = [...producers];
        this.change.next(this.state);
    }

    // Open the login dialog and authenticate the user
    async openLoginDialog() {
        try {
            const result = await this.kit.login();
            this.state.logged = {
                name: result.session.actor.toString(),
                permission: result.session.permission.toString(),
                user: result.session,
            };
            this.change.next(this.state);

            if (this.state.logged) {
                await this.updateVotedProducers();
            }

            this.state.showDialog = true;
            this.change.next(this.state);
        } catch (e) {
            console.error('Error logging in:', e);
        }
    }

    // Reset the modified block producer selection to the original
    resetModifiedBPSelection() {
        this.state.modifiedBPSelection = [...this.state.originalBPSelection];
        this.change.next(this.state);
    }

    // Cast a vote for the current producer
    async voteForUs() {
        this.state.error = '';
        this.change.next(this.state);
        if (!this.state.logged) {
            console.error('No user logged in');
            return;
        }

        const accountName = this.state.logged.name;
        let producers = this.state.originalBPSelection || [];

        if (this.state.roomForMoreBPs === 0) {
            producers = this.state.modifiedBPSelection;
        } else if (!producers.includes(this.config.currentProducer)) {
            producers.push(this.config.currentProducer);
        }

        // Add recommended block producers to the vote list if there is room
        if (this.state.addRecommendedBPs && producers.length < 30) {
            const recommendedBPs = this.config.suggestedBPs.filter(
                (bp) => !producers.includes(bp) && this.state.currentProducerStatics.list.includes(bp)
            );
            recommendedBPs.sort(() => Math.random() - 0.5);
            const remainingVotes = 30 - producers.length;
            const newProducers = recommendedBPs.slice(0, remainingVotes);
            producers = producers.concat(newProducers);

            // Fill remaining slots with top active producers if still under 30
            if (producers.length < 30) {
                const notAdded = this.state.currentProducerStatics.list.filter(
                    (bp) => !producers.includes(bp) && !this.config.notSuggestedBPs.includes(bp)
                );
                notAdded.sort(() => Math.random() - 0.5);
                const remainingVotes = 30 - producers.length;
                const newProducers = notAdded.slice(0, remainingVotes);
                producers = producers.concat(newProducers);
            }
        }

        producers.sort();

        try {
            const result = await this.state.logged.user.transact({
                actions: [
                    {
                        account: 'eosio',
                        name: 'voteproducer',
                        authorization: [
                            {
                                actor: this.state.logged.name,
                                permission: this.state.logged.permission,
                            },
                        ],
                        data: {
                            proxy: '',
                            voter: accountName,
                            producers,
                        },
                    },
                ],
            });

            console.log('Vote successful:', result);
            this.state.thanks = true;
            this.change.next(this.state);
            this.startFetchingStatics();
        } catch (e: any) {
            await this.updateVotedProducers();
            if (e.message.includes('cancelled')) {
                console.log('User cancelled the transaction');
                return;
            } else {
                console.error('Error casting vote:', e);
                this.state.error = e.message || 'An error occurred while casting your vote.';
                this.change.next(this.state);
            }
        }
    }
}
